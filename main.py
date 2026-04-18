import webview
import requests
import json
import time
import threading
import schedule
import hashlib
import websocket
import queue
import struct
import os
import sys
import io
import base64
import re


def _read_version():
    """从 pyproject.toml 或 importlib.metadata 读取版本号"""
    try:
        from importlib.metadata import version as _get_version
        return _get_version("bili-barrage")
    except Exception:
        pass
    try:
        toml_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pyproject.toml")
        with open(toml_path, "r", encoding="utf-8") as f:
            for line in f:
                m = re.match(r'^version\s*=\s*"([^"]+)"', line.strip())
                if m:
                    return m.group(1)
    except Exception:
        pass
    return "0.0.0"


VERSION = _read_version()
GITHUB_REPO = "yyhhkya/bili_barrage"


class Api:
    """暴露给前端 JS 调用的 API"""

    def __init__(self, app):
        self.app = app

    # ---- State ----
    def get_state(self):
        tasks_safe = []
        for t in self.app.tasks:
            tc = {k: v for k, v in t.items() if k != "job_id"}
            tasks_safe.append(tc)
        return json.dumps({
            "accounts": self.app.accounts,
            "tasks": tasks_safe,
            "version": VERSION,
        }, ensure_ascii=False)

    # ---- Accounts ----
    def add_account(self, nickname, key):
        self.app.accounts.append({"nickname": nickname, "key": key})
        self.app.save_config()
        self.app.log(f"添加账号: {nickname}")

    def edit_account(self, index, nickname, key):
        index = int(index)
        if 0 <= index < len(self.app.accounts):
            self.app.accounts[index] = {"nickname": nickname, "key": key}
            self.app.save_config()
            self.app.log(f"编辑账号: {nickname}")

    def delete_account(self, index):
        index = int(index)
        if 0 <= index < len(self.app.accounts):
            nickname = self.app.accounts[index].get("nickname", "")
            self.app.accounts.pop(index)
            self.app.save_config()
            self.app.log(f"删除账号: {nickname}")

    def get_nickname(self, access_key):
        return self.app._get_nickname(access_key)

    # ---- Scan Login ----
    def start_scan_login(self):
        return self.app.start_scan_login()

    def poll_login(self):
        return self.app.poll_login()

    def cancel_login(self):
        self.app.login_cancelled = True

    # ---- Send Danmaku ----
    def send_danmaku(self, room_id, content, account_indices_json):
        indices = json.loads(account_indices_json)
        threading.Thread(
            target=self.app._send_danmaku_thread,
            args=(room_id, content, indices),
            daemon=True,
        ).start()

    def send_likes(self, room_id, click_time, account_indices_json):
        indices = json.loads(account_indices_json)
        click_time = int(click_time)
        threading.Thread(
            target=self.app._send_likes_thread,
            args=(room_id, click_time, indices),
            daemon=True,
        ).start()

    # ---- Tasks ----
    def add_task(self, remark, room_id, content, interval, account_indices_json):
        indices = json.loads(account_indices_json)
        interval = int(interval)
        selected = [self.app.accounts[i] for i in indices if i < len(self.app.accounts)]
        task = {
            "id": len(self.app.tasks) + 1,
            "room_id": room_id,
            "room_remark": remark,
            "content": content,
            "accounts": [a.get("nickname", "") for a in selected],
            "account_keys": [a["key"] for a in selected],
            "interval": interval,
            "status": "停止",
            "job_id": None,
            "current_content_index": 0,
        }
        self.app.tasks.append(task)
        self.app.save_config()
        self.app.log(f"添加定时任务: 房间 {room_id}, 间隔 {interval} 分钟")

    def edit_task(self, index, remark, room_id, content, interval, account_indices_json):
        index = int(index)
        interval = int(interval)
        indices = json.loads(account_indices_json)
        if 0 <= index < len(self.app.tasks):
            task = self.app.tasks[index]
            if task.get("job_id"):
                schedule.cancel_job(task["job_id"])
            selected = [self.app.accounts[i] for i in indices if i < len(self.app.accounts)]
            task["room_id"] = room_id
            task["room_remark"] = remark
            task["content"] = content
            task["accounts"] = [a.get("nickname", "") for a in selected]
            task["account_keys"] = [a["key"] for a in selected]
            task["interval"] = interval
            task["status"] = "停止"
            task["job_id"] = None
            task["current_content_index"] = 0
            self.app.save_config()
            self.app.log(f"编辑定时任务: 房间 {room_id}, 间隔 {interval} 分钟")

    def delete_task(self, index):
        index = int(index)
        if 0 <= index < len(self.app.tasks):
            task = self.app.tasks[index]
            if task.get("job_id"):
                schedule.cancel_job(task["job_id"])
            room_id = task["room_id"]
            self.app.tasks.pop(index)
            self.app.save_config()
            self.app.log(f"删除定时任务: 房间 {room_id}")

    def start_task(self, index):
        index = int(index)
        if 0 <= index < len(self.app.tasks):
            task = self.app.tasks[index]
            if task["status"] == "运行中":
                return
            task["status"] = "启动中"
            threading.Thread(
                target=self.app._start_task_thread,
                args=(task,),
                daemon=True,
            ).start()

    def stop_task(self, index):
        index = int(index)
        if 0 <= index < len(self.app.tasks):
            task = self.app.tasks[index]
            if task["status"] == "停止":
                return
            task["status"] = "停止中"
            threading.Thread(
                target=self.app._stop_task_thread,
                args=(task,),
                daemon=True,
            ).start()

    # ---- Watch ----
    def get_watch_status(self):
        return json.dumps(self.app.watch_manager.get_watch_status())

    def start_watch(self, room_id, account_indices_json):
        indices = json.loads(account_indices_json)
        selected = [self.app.accounts[i] for i in indices if i < len(self.app.accounts)]
        threading.Thread(
            target=self.app._start_watch_thread,
            args=(room_id, selected),
            daemon=True,
        ).start()

    def stop_watch(self, room_id, account_indices_json):
        indices = json.loads(account_indices_json)
        selected = [self.app.accounts[i] for i in indices if i < len(self.app.accounts)]
        threading.Thread(
            target=self.app._stop_watch_thread,
            args=(room_id, selected),
            daemon=True,
        ).start()

    # ---- Update ----
    def check_update(self):
        return self.app.check_update()

    def download_update(self):
        threading.Thread(target=self.app.download_and_apply_update, daemon=True).start()

    def get_update_progress(self):
        return json.dumps(self.app._update_progress, ensure_ascii=False)

    # ---- Logs ----
    def get_new_logs(self):
        logs = []
        while not self.app.log_queue.empty():
            try:
                logs.append(self.app.log_queue.get_nowait())
            except queue.Empty:
                break
        return logs


class BiliBarrageSender:
    def __init__(self):
        self.accounts = []
        self.tasks = []
        self.log_queue = queue.Queue()
        self.watch_manager = WatchManager(self)

        # 日志管理
        self.logs_dir = "logs"
        self.current_log_file = None
        self.log_file_lock = threading.Lock()
        self._ensure_logs_dir()
        self._update_log_file()

        # 加载配置
        self.load_config()

        # 扫码登录状态
        self.login_cancelled = False
        self._auth_code = None

        # 更新下载进度: {"percent": 0-100, "status": "idle"|"downloading"|"done"|"error", "message": ""}
        self._update_progress = {"percent": 0, "status": "idle", "message": ""}

        # 清理上次更新残留文件
        self._cleanup_update_leftovers()

        # 启动定时任务线程
        self.schedule_thread = threading.Thread(target=self.run_schedule, daemon=True)
        self.schedule_thread.start()

    def _ensure_logs_dir(self):
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)

    def _update_log_file(self):
        today = time.strftime("%Y-%m-%d")
        max_seq = 0
        if os.path.exists(self.logs_dir):
            for file in os.listdir(self.logs_dir):
                if file.startswith(f"{today}-") and file.endswith(".log"):
                    try:
                        seq = int(file.split("-")[-1].split(".")[0])
                        if seq > max_seq:
                            max_seq = seq
                    except ValueError:
                        pass
        new_seq = max_seq + 1
        self.current_log_file = os.path.join(self.logs_dir, f"{today}-{new_seq}.log")
        self.log(f"开始使用新的日志文件: {self.current_log_file}")

    # ---- Logging ----
    def log(self, message):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}"
        self.log_queue.put(log_message)
        if self.current_log_file:
            with self.log_file_lock:
                try:
                    with open(self.current_log_file, "a", encoding="utf-8") as f:
                        f.write(log_message + "\n")
                except Exception:
                    pass

    # ---- Config ----
    def load_config(self):
        try:
            with open("config.json", "r", encoding="utf-8") as f:
                config = json.load(f)
                self.accounts = config.get("accounts", [])
                self.tasks = config.get("tasks", [])
                for task in self.tasks:
                    task.setdefault("job_id", None)
                    task.setdefault("current_content_index", 0)
                    if task.get("status") == "运行中":
                        threading.Thread(
                            target=self._auto_start_task,
                            args=(task,),
                            daemon=True,
                        ).start()
        except FileNotFoundError:
            self.accounts = []
            self.tasks = []
        except Exception as e:
            self.log(f"加载配置失败: {str(e)}")
            self.accounts = []
            self.tasks = []

    def save_config(self):
        try:
            tasks_to_save = []
            for task in self.tasks:
                tc = {k: v for k, v in task.items() if k != "job_id"}
                tasks_to_save.append(tc)
            config = {"accounts": self.accounts, "tasks": tasks_to_save}
            with open("config.json", "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self.log(f"保存配置失败: {str(e)}")

    # ---- Bilibili API helpers ----
    def sign_bilibili_params(self, params, appsecret):
        sorted_keys = sorted(params.keys())
        query_string = "&".join([f"{key}={params[key]}" for key in sorted_keys])
        return hashlib.md5((query_string + appsecret).encode()).hexdigest()

    def _get_nickname(self, access_key):
        try:
            url = "https://app.bilibili.com/x/v2/account/mine"
            appkey = "4409e2ce8ffd12b8"
            appsec = "59b43e04ad6965f34319062b478f83dd"
            ts = int(time.time())
            params = {
                "access_key": access_key,
                "actionKey": "appkey",
                "appkey": appkey,
                "ts": ts,
            }
            sign = self.sign_bilibili_params(params, appsec)
            params["sign"] = sign
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = requests.get(url, params=params, headers=headers, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0 and result.get("data"):
                    nickname = (
                        result["data"].get("name", "")
                        or result["data"].get("uname", "")
                        or result["data"].get("nickname", "")
                    )
                    if nickname:
                        self.log(f"获取用户昵称成功: {nickname}")
                        return nickname
            self.log("获取用户昵称失败")
        except Exception as e:
            self.log(f"获取用户昵称失败: {str(e)}")
        return None

    def get_room_up_id(self, room_id):
        try:
            url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = requests.get(url, headers=headers)
            result = response.json()
            if result.get("code") == 0 and result.get("data"):
                return result["data"].get("uid")
            else:
                self.log(f"获取直播间 {room_id} 信息失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.log(f"获取直播间 {room_id} 信息失败: {str(e)}")
        return None

    # ---- Scan Login ----
    def start_scan_login(self):
        try:
            import qrcode

            self.login_cancelled = False
            self.log("开始扫码登录...")
            qrcode_url, auth_code = self._get_tv_qrcode()
            self._auth_code = auth_code

            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            qr.add_data(qrcode_url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            self.log(f"扫码登录失败: {str(e)}")
            return None

    def _get_tv_qrcode(self):
        url = "http://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code"
        appkey = "4409e2ce8ffd12b8"
        appsec = "59b43e04ad6965f34319062b478f83dd"
        data = {"local_id": "0", "ts": str(int(time.time())), "appkey": appkey}
        sign = self.sign_bilibili_params(data, appsec)
        data["sign"] = sign
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        response = requests.post(url, data=data, headers=headers, timeout=10)
        result = response.json()
        if result.get("code") == 0:
            return result["data"]["url"], result["data"]["auth_code"]
        raise Exception(f"获取二维码失败: {result.get('message', '未知错误')}")

    def poll_login(self):
        if self.login_cancelled or not self._auth_code:
            return "failed"
        try:
            url = "http://passport.bilibili.com/x/passport-tv-login/qrcode/poll"
            appkey = "4409e2ce8ffd12b8"
            appsec = "59b43e04ad6965f34319062b478f83dd"
            data = {
                "auth_code": self._auth_code,
                "local_id": "0",
                "ts": str(int(time.time())),
                "appkey": appkey,
            }
            sign = self.sign_bilibili_params(data, appsec)
            data["sign"] = sign
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
            response = requests.post(url, data=data, headers=headers, timeout=10)
            result = response.json()
            if result.get("code") == 0:
                access_key = result["data"]["access_token"]
                self._auth_code = None
                self.log("扫码登录成功")
                return access_key
            return "pending"
        except Exception as e:
            self.log(f"登录轮询失败: {str(e)}")
            return "pending"

    # ---- Send Danmaku ----
    def _send_danmaku_thread(self, room_id, content, indices):
        for i in indices:
            if i < len(self.accounts):
                self.send_danmaku_to_room(self.accounts[i], room_id, content)
                time.sleep(2)

    def send_danmaku_to_room(self, account, room_id, content):
        try:
            nickname = account.get("nickname", "")
            self.log(f"[{nickname}] 尝试向房间 {room_id} 发送弹幕: {content}")
            url = "https://api.live.bilibili.com/xlive/app-room/v1/dM/sendmsg"
            appkey = "4409e2ce8ffd12b8"
            appsecret = "59b43e04ad6965f34319062b478f83dd"
            ts = int(time.time())
            params = {
                "access_key": account["key"],
                "actionKey": "appkey",
                "appkey": appkey,
                "cid": room_id,
                "msg": content,
                "rnd": ts,
                "color": "16777215",
                "fontsize": "25",
                "mode": "1",
                "ts": ts,
            }
            sign = self.sign_bilibili_params(params, appsecret)
            params["sign"] = sign
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2",
            }
            response = requests.post(url, data=params, headers=headers)
            result = response.json()
            if result.get("code") == 0:
                self.log(f"[{nickname}] 成功向房间 {room_id} 发送弹幕")
            else:
                self.log(f"[{nickname}] 发送失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.log(f"[{account.get('nickname', '')}] 发送异常: {str(e)}")

    # ---- Like ----
    def _get_my_uid(self, access_key):
        try:
            url = "https://app.bilibili.com/x/v2/account/mine"
            appkey = "4409e2ce8ffd12b8"
            appsec = "59b43e04ad6965f34319062b478f83dd"
            ts = int(time.time())
            params = {
                "access_key": access_key,
                "actionKey": "appkey",
                "appkey": appkey,
                "ts": ts,
            }
            params["sign"] = self.sign_bilibili_params(params, appsec)
            headers = {
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2"
            }
            response = requests.get(url, params=params, headers=headers, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0 and result.get("data", {}).get("mid"):
                    return result["data"]["mid"]
        except Exception as e:
            self.log(f"获取用户UID失败: {str(e)}")
        return None

    def like_room(self, account, room_id, click_time):
        import random
        import string
        nickname = account.get("nickname", "")
        try:
            anchor_uid = self.get_room_up_id(room_id)
            if not anchor_uid:
                self.log(f"[{nickname}] 获取直播间 {room_id} 主播信息失败，点赞取消")
                return
            self_uid = self._get_my_uid(account["key"])
            if not self_uid:
                self.log(f"[{nickname}] 获取用户UID失败，使用主播UID作为降级")
                self_uid = anchor_uid

            url = "https://api.live.bilibili.com/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3"
            appkey = "4409e2ce8ffd12b8"
            appsecret = "59b43e04ad6965f34319062b478f83dd"
            buvid = "".join(random.choices(string.ascii_uppercase + string.digits, k=37))

            base_params = {
                "access_key": account["key"],
                "actionKey": "appkey",
                "anchor_id": anchor_uid,
                "appkey": appkey,
                "click_time": click_time,
                "room_id": room_id,
                "uid": self_uid,
            }
            sign = self.sign_bilibili_params(base_params, appsecret)
            base_params["sign"] = sign

            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2",
                "Buvid": buvid,
                "env": "prod",
            }
            response = requests.post(url, data=base_params, headers=headers, timeout=15)
            result = response.json()
            if result.get("code") == 0:
                self.log(f"[{nickname}] 直播间 {room_id} 点赞完成 (click_time={click_time})")
            else:
                self.log(f"[{nickname}] 直播间 {room_id} 点赞失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.log(f"[{nickname}] 直播间 {room_id} 点赞异常: {str(e)}")

    def _send_likes_thread(self, room_id, click_time, indices):
        for i in indices:
            if i < len(self.accounts):
                self.like_room(self.accounts[i], room_id, click_time)
                time.sleep(1)
    def _start_task_thread(self, task):
        try:
            up_id = self.get_room_up_id(task["room_id"])
            if not up_id:
                self.log(f"无法获取直播间 {task['room_id']} 的主播信息，任务启动失败")
                task["status"] = "停止"
                return
            for key in task["account_keys"]:
                account = next((a for a in self.accounts if a["key"] == key), None)
                if account:
                    self.watch_manager.start_watch(
                        key, task["room_id"], up_id, account.get("nickname", "")
                    )
                    time.sleep(1)

            def job():
                contents = [c.strip() for c in task["content"].split(",") if c.strip()]
                if not contents:
                    return
                idx = task.get("current_content_index", 0)
                current = contents[idx]
                for key in task["account_keys"]:
                    account = next((a for a in self.accounts if a["key"] == key), None)
                    if account:
                        self.send_danmaku_to_room(account, task["room_id"], current)
                        time.sleep(2)
                task["current_content_index"] = (idx + 1) % len(contents)

            job()
            job_id = schedule.every(task["interval"]).minutes.do(job)
            task["job_id"] = job_id
            task["status"] = "运行中"
            task["up_id"] = up_id
            self.save_config()
            self.log(f"启动定时任务: 房间 {task['room_id']}, 间隔 {task['interval']} 分钟")
        except Exception as e:
            self.log(f"启动任务失败: {str(e)}")
            task["status"] = "停止"

    def _stop_task_thread(self, task):
        try:
            if task.get("job_id"):
                schedule.cancel_job(task["job_id"])
            for key in task["account_keys"]:
                self.watch_manager.stop_watch(key, task["room_id"])
                time.sleep(0.5)
            task["status"] = "停止"
            task["job_id"] = None
            self.save_config()
            self.log(f"停止定时任务: 房间 {task['room_id']}")
        except Exception as e:
            self.log(f"停止任务失败: {str(e)}")
            task["status"] = "运行中"

    def _auto_start_task(self, task):
        try:
            up_id = self.get_room_up_id(task["room_id"])
            if not up_id:
                self.log(f"无法获取直播间 {task['room_id']} 的主播信息，任务启动失败")
                return
            for key in task["account_keys"]:
                account = next((a for a in self.accounts if a["key"] == key), None)
                if account:
                    self.watch_manager.start_watch(
                        key, task["room_id"], up_id, account.get("nickname", "")
                    )
                    time.sleep(1)

            def job():
                contents = [c.strip() for c in task["content"].split(",") if c.strip()]
                if not contents:
                    return
                idx = task.get("current_content_index", 0)
                current = contents[idx]
                for key in task["account_keys"]:
                    account = next((a for a in self.accounts if a["key"] == key), None)
                    if account:
                        self.send_danmaku_to_room(account, task["room_id"], current)
                        time.sleep(2)
                task["current_content_index"] = (idx + 1) % len(contents)

            job()
            job_id = schedule.every(task["interval"]).minutes.do(job)
            task["job_id"] = job_id
            task["up_id"] = up_id
            self.log(f"自动启动定时任务: 房间 {task['room_id']}, 间隔 {task['interval']} 分钟")
        except Exception as e:
            self.log(f"自动启动任务失败: {str(e)}")

    # ---- Watch ----
    def _start_watch_thread(self, room_id, selected_accounts):
        up_id = self.get_room_up_id(room_id)
        if not up_id:
            self.log(f"无法获取直播间 {room_id} 的主播信息")
            return
        for account in selected_accounts:
            self.watch_manager.start_watch(
                account["key"], room_id, up_id, account.get("nickname", "")
            )
            time.sleep(1)
        self.log("挂榜任务已启动")

    def _stop_watch_thread(self, room_id, selected_accounts):
        for account in selected_accounts:
            self.watch_manager.stop_watch(account["key"], room_id)
            time.sleep(0.5)
        self.log("挂榜任务已停止")

    # ---- Schedule ----
    def run_schedule(self):
        while True:
            schedule.run_pending()
            time.sleep(1)

    # ---- Update Check ----
    def _cleanup_update_leftovers(self):
        """启动时清理上次更新残留的 .old / .backup / update.bat / update_log.txt 文件"""
        if not getattr(sys, 'frozen', False):
            return
        try:
            app_dir = os.path.dirname(sys.executable)
            for fname in os.listdir(app_dir):
                fpath = os.path.join(app_dir, fname)
                if fname in ("update.bat", "update_log.txt") or fname.endswith((".old", ".backup", ".new")):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass
        except Exception:
            pass

    def check_update(self):
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "bili_barrage-update-checker",
            }
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                tag = data.get("tag_name", "")
                latest = re.sub(r'^v', '', tag)
                if self._compare_versions(latest, VERSION) > 0:
                    return json.dumps({
                        "has_update": True,
                        "latest_version": latest,
                        "current_version": VERSION,
                        "url": data.get("html_url", ""),
                        "body": data.get("body", ""),
                    }, ensure_ascii=False)
            return json.dumps({"has_update": False, "current_version": VERSION}, ensure_ascii=False)
        except Exception as e:
            self.log(f"检查更新失败: {str(e)}")
            return json.dumps({"has_update": False, "current_version": VERSION}, ensure_ascii=False)

    @staticmethod
    def _compare_versions(v1, v2):
        """比较两个版本号，v1 > v2 返回正数，v1 < v2 返回负数，相等返回 0"""
        parts1 = [int(x) for x in v1.split(".")]
        parts2 = [int(x) for x in v2.split(".")]
        for a, b in zip(parts1, parts2):
            if a != b:
                return a - b
        return len(parts1) - len(parts2)

    def download_and_apply_update(self):
        """下载最新版本，通过 bat 脚本安全替换当前程序"""
        import subprocess
        import tempfile

        temp_file = None
        try:
            self._update_progress = {"percent": 0, "status": "downloading", "message": "正在获取版本信息..."}
            self.log("正在获取最新版本信息...")
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "bili_barrage-update-checker",
            }
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code != 200:
                self._update_progress = {"percent": 0, "status": "error", "message": "获取更新信息失败"}
                self.log("获取更新信息失败")
                return

            data = response.json()
            assets = data.get("assets", [])

            exe_asset = None
            for asset in assets:
                if asset["name"].endswith(".exe"):
                    exe_asset = asset
                    break

            if not exe_asset:
                self._update_progress = {"percent": 0, "status": "error", "message": "未找到可下载的 exe 文件"}
                self.log("未找到可下载的 exe 文件，请手动前往 GitHub 下载")
                return

            download_url = exe_asset["browser_download_url"]
            file_size = exe_asset.get("size", 0)
            size_mb = file_size / 1024 / 1024 if file_size else 0
            self._update_progress = {"percent": 0, "status": "downloading", "message": f"开始下载 ({size_mb:.1f} MB)"}
            self.log(f"开始下载: {exe_asset['name']} ({size_mb:.1f} MB)")

            is_frozen = getattr(sys, 'frozen', False)
            if is_frozen:
                current_exe = sys.executable
                app_dir = os.path.dirname(current_exe)
            else:
                current_exe = os.path.abspath(__file__)
                app_dir = os.path.dirname(current_exe)

            # 下载到临时目录，避免污染程序目录
            temp_dir = tempfile.mkdtemp(prefix="bili_update_")
            temp_file = os.path.join(temp_dir, exe_asset["name"])

            dl_response = requests.get(download_url, stream=True, timeout=(15, 300), allow_redirects=True)
            dl_response.raise_for_status()
            downloaded = 0
            last_pct = -1
            sha256 = hashlib.sha256()
            with open(temp_file, "wb") as f:
                for chunk in dl_response.iter_content(chunk_size=65536):
                    f.write(chunk)
                    sha256.update(chunk)
                    downloaded += len(chunk)
                    if file_size > 0:
                        pct = min(downloaded * 100 // file_size, 99)
                        if pct != last_pct:
                            last_pct = pct
                            self._update_progress = {
                                "percent": pct,
                                "status": "downloading",
                                "message": f"下载中 {pct}% ({downloaded / 1024 / 1024:.1f}/{size_mb:.1f} MB)",
                            }

            # 校验文件大小
            actual_size = os.path.getsize(temp_file)
            if file_size > 0 and actual_size != file_size:
                msg = f"文件大小不匹配: 期望 {file_size}, 实际 {actual_size}"
                self._update_progress = {"percent": 0, "status": "error", "message": msg}
                self.log(f"下载失败: {msg}")
                return

            # 从 release body 中尝试提取 SHA256 进行校验（格式: SHA256: <hash>）
            release_body = data.get("body", "") or ""
            sha256_match = re.search(r'(?i)sha256\s*[:：]\s*([0-9a-fA-F]{64})', release_body)
            if sha256_match:
                expected_hash = sha256_match.group(1).lower()
                actual_hash = sha256.hexdigest()
                if actual_hash != expected_hash:
                    msg = f"SHA256 校验失败"
                    self._update_progress = {"percent": 0, "status": "error", "message": msg}
                    self.log(f"下载失败: {msg} (期望 {expected_hash[:16]}..., 实际 {actual_hash[:16]}...)")
                    return
                self.log(f"SHA256 校验通过: {actual_hash[:16]}...")

            self.log(f"下载完成，文件大小: {actual_size} 字节")
            self._update_progress = {"percent": 100, "status": "done", "message": "下载完成，准备更新..."}

            if is_frozen:
                # 打包模式：将新 exe 放到程序目录的 .new 文件，用 bat 脚本完成替换
                current_exe_name = os.path.basename(current_exe)
                new_exe_name = exe_asset["name"]
                new_file_in_app_dir = os.path.join(app_dir, new_exe_name + ".new")
                current_pid = os.getpid()

                # 移动到程序目录（跨盘会自动 copy+delete）
                import shutil
                if os.path.exists(new_file_in_app_dir):
                    os.remove(new_file_in_app_dir)
                shutil.move(temp_file, new_file_in_app_dir)
                temp_file = None  # 已移走，不再清理

                # 生成 update.bat（纯 ASCII，避免中文编码问题）
                bat_path = os.path.join(app_dir, "update.bat")
                log_file = "update_log.txt"
                bat_content = f'''@echo off

cd /d "{app_dir}"
set "LOG={log_file}"

echo [%date% %time%] update script started >> %LOG%
echo [%date% %time%] cwd: %cd% >> %LOG%
echo [%date% %time%] waiting for old process PID={current_pid} >> %LOG%

set /a WAIT=0
:WAIT_LOOP
tasklist /FI "PID eq {current_pid}" 2>nul | find /I "{current_pid}" >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] old process exited >> %LOG%
    goto :WAIT_DONE
)
if %WAIT% GEQ 30 (
    echo [%date% %time%] wait timeout, force continue >> %LOG%
    goto :WAIT_DONE
)
timeout /t 1 /nobreak >nul 2>&1
set /a WAIT+=1
goto :WAIT_LOOP
:WAIT_DONE

timeout /t 1 /nobreak >nul 2>&1

echo [%date% %time%] cleaning _MEI temp dirs >> %LOG%
for /d %%D in ("%TEMP%\\_MEI*") do (
    rmdir /s /q "%%D" >nul 2>&1
    if not exist "%%D" (
        echo [%date% %time%]   removed: %%D >> %LOG%
    )
)

if not exist "{new_exe_name}.new" (
    echo [%date% %time%] [ERROR] new file not found, abort >> %LOG%
    exit /b 1
)
echo [%date% %time%] new file confirmed: {new_exe_name}.new >> %LOG%

if exist "{current_exe_name}" (
    if exist "{current_exe_name}.backup" del /f /q "{current_exe_name}.backup" >nul 2>&1
    ren "{current_exe_name}" "{current_exe_name}.backup" >nul 2>&1
    if exist "{current_exe_name}" (
        echo [%date% %time%] [ERROR] cannot rename old exe, may still running >> %LOG%
        exit /b 1
    )
    echo [%date% %time%] backup: {current_exe_name} -^> {current_exe_name}.backup >> %LOG%
)

ren "{new_exe_name}.new" "{new_exe_name}" >nul 2>&1
if not exist "{new_exe_name}" (
    echo [%date% %time%] [ERROR] rename new file failed, rollback >> %LOG%
    if exist "{current_exe_name}.backup" ren "{current_exe_name}.backup" "{current_exe_name}" >nul 2>&1
    exit /b 1
)
echo [%date% %time%] replaced: {new_exe_name}.new -^> {new_exe_name} >> %LOG%

echo [%date% %time%] waiting 3s for file system sync and antivirus scan >> %LOG%
timeout /t 3 /nobreak >nul 2>&1

echo [%date% %time%] current PATH: %PATH% >> %LOG%

set /a RETRY=0
:START_LOOP
echo [%date% %time%] starting new version (attempt %RETRY%) >> %LOG%

for /d %%D in ("%TEMP%\\_MEI*") do (
    rmdir /s /q "%%D" >nul 2>&1
)

REM reset environment to avoid PyInstaller inherited vars causing DLL issues
setlocal
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0\"
set "_PYI_ARCHIVE_FILE="
set "_PYI_SPLASH_IPC="
set "TCL_LIBRARY="
set "TK_LIBRARY="
start "" "{new_exe_name}"
endlocal

timeout /t 8 /nobreak >nul 2>&1

tasklist /FI "IMAGENAME eq {new_exe_name}" 2>nul | find /I "{new_exe_name}" >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] [WARN] process not found after start >> %LOG%
    goto :START_RETRY
)

tasklist /V /FI "IMAGENAME eq {new_exe_name}" /FI "WINDOWTITLE eq Error" 2>nul | find /I "{new_exe_name}" >nul 2>&1
if not errorlevel 1 (
    echo [%date% %time%] [WARN] process has Error dialog, killing >> %LOG%
    taskkill /F /FI "IMAGENAME eq {new_exe_name}" /FI "WINDOWTITLE eq Error" >nul 2>&1
    timeout /t 2 /nobreak >nul 2>&1
    goto :START_RETRY
)

echo [%date% %time%] new version started OK >> %LOG%
goto :CLEANUP

:START_RETRY
set /a RETRY+=1
if %RETRY% GEQ 3 (
    echo [%date% %time%] [ERROR] all 3 attempts failed, rollback >> %LOG%
    for /d %%D in ("%TEMP%\\_MEI*") do (
        rmdir /s /q "%%D" >nul 2>&1
    )
    del /f /q "{new_exe_name}" >nul 2>&1
    if exist "{current_exe_name}.backup" (
        ren "{current_exe_name}.backup" "{current_exe_name}" >nul 2>&1
        echo [%date% %time%] rolled back to old version >> %LOG%
        setlocal
        set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0\"
        set "_PYI_ARCHIVE_FILE="
        start "" "{current_exe_name}"
        endlocal
    )
    exit /b 1
)
echo [%date% %time%] retry %RETRY% of 3, waiting 3s >> %LOG%
timeout /t 3 /nobreak >nul 2>&1
goto :START_LOOP

:CLEANUP
if exist "{current_exe_name}.backup" del /f /q "{current_exe_name}.backup" >nul 2>&1
if exist "{current_exe_name}.old" del /f /q "{current_exe_name}.old" >nul 2>&1

echo [%date% %time%] update completed >> %LOG%

timeout /t 2 /nobreak >nul 2>&1
del /f /q "%LOG%" >nul 2>&1
del /f /q "%~f0" >nul 2>&1
exit /b 0
'''
                with open(bat_path, "w", encoding="ascii") as f:
                    f.write(bat_content)

                self._update_progress = {"percent": 100, "status": "done", "message": "正在重启应用..."}
                self.log("正在启动更新脚本...")

                # 启动 bat 脚本（隐藏窗口）
                subprocess.Popen(
                    [bat_path],
                    cwd=app_dir,
                    shell=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                time.sleep(0.5)
                os._exit(0)
            else:
                # 开发模式：直接放到程序目录
                final_path = os.path.join(app_dir, exe_asset["name"])
                import shutil
                if os.path.exists(final_path):
                    os.remove(final_path)
                shutil.move(temp_file, final_path)
                temp_file = None
                self._update_progress = {"percent": 100, "status": "done", "message": f"已下载到: {final_path}"}
                self.log(f"更新已下载到: {final_path}")

        except Exception as e:
            self._update_progress = {"percent": 0, "status": "error", "message": f"下载失败: {str(e)}"}
            self.log(f"下载更新失败: {str(e)}")
        finally:
            # 清理临时文件
            try:
                if temp_file and os.path.exists(temp_file):
                    os.remove(temp_file)
                    temp_dir = os.path.dirname(temp_file)
                    if os.path.isdir(temp_dir) and temp_dir.startswith(tempfile.gettempdir()):
                        import shutil
                        shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

    # ---- Run ----
    def run(self):
        api = Api(self)
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        html_path = os.path.join(base_dir, "web", "index.html")
        window = webview.create_window(
            f"B站弹幕助手 v{VERSION}",
            html_path,
            js_api=api,
            width=1200,
            height=720,
            min_size=(1000, 600),
        )
        webview.start(debug=False)

class BiliLiveWS:
    def __init__(self, app, room_id, uid, token, host, port, remark):
        self.app = app
        self.room_id = room_id
        self.uid = uid
        self.token = token
        self.host = host
        self.port = port
        self.remark = remark
        self.ws = None
        self.heartbeat_timer = None
    
    def connect(self):
        address = f"wss://{self.host}:{self.port}/sub"
        self.app.log(f"[{self.remark}] 正在连接 WebSocket: {address}")
        
        def on_open(ws):
            self.app.log(f"[{self.remark}] 直播间 {self.room_id} WebSocket 已连接")
            self.send_auth()
        
        def on_error(ws, error):
            self.app.log(f"[{self.remark}] 直播间 {self.room_id} WebSocket 错误: {error}")
        
        def on_close(ws, close_status_code, close_msg):
            self.stop_heartbeat()
            self.app.log(f"[{self.remark}] 直播间 {self.room_id} WebSocket 已关闭")
        
        self.ws = websocket.WebSocketApp(
            address,
            on_open=on_open,
            on_error=on_error,
            on_close=on_close
        )
        
        # 启动WebSocket线程
        threading.Thread(target=self.ws.run_forever, daemon=True).start()
    
    def send_auth(self):
        if not self.ws:
            return
        
        auth_data = {
            "uid": self.uid,
            "roomid": int(self.room_id),
            "protover": 2,
            "platform": "web",
            "type": 2,
            "key": self.token
        }
        self.ws.send(self.encode_packet(7, json.dumps(auth_data)))
        self.start_heartbeat()
    
    def start_heartbeat(self):
        self.stop_heartbeat()
        self.heartbeat_timer = threading.Timer(30, self.send_heartbeat)
        self.heartbeat_timer.daemon = True
        self.heartbeat_timer.start()
    
    def send_heartbeat(self):
        if self.ws and self.ws.sock and self.ws.sock.connected:
            self.ws.send(self.encode_packet(2, "[object Object]"))
        self.start_heartbeat()
    
    def stop_heartbeat(self):
        if self.heartbeat_timer:
            self.heartbeat_timer.cancel()
            self.heartbeat_timer = None
    
    def close(self):
        self.stop_heartbeat()
        if self.ws:
            self.ws.close()
            self.ws = None
    
    def encode_packet(self, op, body):
        is_string = isinstance(body, str)
        body_bytes = body.encode('utf-8') if is_string else body
        len_body = len(body_bytes)
        packet_len = 16 + len_body
        
        buf = bytearray(packet_len)
        struct.pack_into('!I', buf, 0, packet_len)
        struct.pack_into('!H', buf, 4, 16)
        struct.pack_into('!H', buf, 6, 1)
        struct.pack_into('!I', buf, 8, op)
        struct.pack_into('!I', buf, 12, 1)
        buf[16:] = body_bytes
        
        return buf

class WatchManager:
    def __init__(self, app):
        self.app = app
        self.tasks = {}
        self.ws_tasks = {}
    
    def has_task(self, access_key, room_id):
        key = f"{access_key}-{room_id}"
        return key in self.tasks
    
    def start_watch(self, access_key, room_id, up_id, remark):
        key = f"{access_key}-{room_id}"
        
        # 检查是否已有任务
        if self.has_task(access_key, room_id):
            self.app.log(f"[{remark}] 直播间 {room_id} 已有任务运行中")
            return
        
        self.app.log(f"[{remark}] 开始监听直播间 {room_id}")
        
        # 1. 获取用户信息
        user_info = self.get_my_uid(access_key, remark)
        if not user_info:
            self.app.log(f"[{remark}] 无法获取用户信息，任务终止")
            return
        
        # 2. Web端进房
        self.web_room_enter(access_key, room_id, user_info['cookie'], remark)
        
        # 3. 建立WebSocket连接
        danmu_info = self.get_danmu_info(room_id, user_info['cookie'], remark)
        if not danmu_info:
            danmu_info = self.get_danmu_info_mobile(room_id, access_key, remark)
        
        if danmu_info and danmu_info.get('host_list'):
            host_info = danmu_info['host_list'][0]
            ws_client = BiliLiveWS(
                self.app,
                room_id,
                user_info['uid'],
                danmu_info['token'],
                host_info['host'],
                host_info['wss_port'],
                remark
            )
            ws_client.connect()
            self.ws_tasks[key] = ws_client
        else:
            self.app.log(f"[{remark}] 获取WebSocket信息失败，无法建立长连接")
        
        # 4. 发送心跳
        def send_heartbeat():
            self.web_heartbeat(access_key, room_id, user_info['cookie'], remark)
        
        # 立即发送一次心跳
        send_heartbeat()
        
        # 跳过点赞操作
        
        # 6. 设置定时心跳
        timer = threading.Timer(60, self._heartbeat_loop, args=(access_key, room_id, user_info['cookie'], remark, send_heartbeat))
        timer.daemon = True
        timer.start()
        
        self.tasks[key] = {
            'timer': timer,
            'remark': remark,
            'room_id': room_id,
            'access_key': access_key,
        }
        
        self.app.log(f"[{remark}] 已开始进房任务 {room_id}")
    
    def _heartbeat_loop(self, access_key, room_id, cookie, remark, send_heartbeat):
        key = f"{access_key}-{room_id}"
        
        if key not in self.tasks:
            return
        
        send_heartbeat()
        
        # 继续定时
        timer = threading.Timer(60, self._heartbeat_loop, args=(access_key, room_id, cookie, remark, send_heartbeat))
        timer.daemon = True
        timer.start()
        
        self.tasks[key]['timer'] = timer
    
    def get_watch_status(self):
        result = []
        for key, task in self.tasks.items():
            result.append({
                "account": task.get("remark", "未知"),
                "room_id": task.get("room_id", ""),
            })
        return result

    def stop_watch(self, access_key, room_id):
        key = f"{access_key}-{room_id}"
        
        if key in self.tasks:
            task = self.tasks[key]
            if task['timer']:
                task['timer'].cancel()
            del self.tasks[key]
        
        if key in self.ws_tasks:
            ws_client = self.ws_tasks[key]
            ws_client.close()
            del self.ws_tasks[key]
            
            remark = self.tasks.get(key, {}).get('remark', access_key[:8])
            self.app.log(f"[{remark}] 直播间 {room_id} 任务已停止")
    
    def stop_all(self):
        for key in list(self.tasks.keys()):
            access_key, room_id = key.split('-', 1)
            self.stop_watch(access_key, room_id)
    
    def get_my_uid(self, access_key, remark):
        try:
            url = "https://app.bilibili.com/x/v2/account/mine"
            appkey = "4409e2ce8ffd12b8"
            appsecret = "59b43e04ad6965f34319062b478f83dd"
            
            ts = int(time.time())
            params = {
                "access_key": access_key,
                "actionKey": "appkey",
                "appkey": appkey,
                "ts": ts
            }
            
            sign = self.sign_bilibili_params(params, appsecret)
            params["sign"] = sign
            
            headers = {
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2"
            }
            
            response = requests.get(url, params=params, headers=headers)
            result = response.json()
            
            if result.get('code') == 0 and result.get('data') and result['data'].get('mid'):
                # 获取cookie
                cookie = ""
                if 'Set-Cookie' in response.headers:
                    cookies = response.headers['Set-Cookie'].split(';')
                    cookie = '; '.join([c.split('=')[0] + '=' + c.split('=')[1] for c in cookies if '=' in c])
                
                return {
                    'uid': result['data']['mid'],
                    'cookie': cookie
                }
        except Exception as e:
            self.app.log(f"[{remark}] 获取用户信息失败: {str(e)}")
        
        return None
    
    def web_room_enter(self, access_key, room_id, cookie, remark):
        try:
            url = "https://api.live.bilibili.com/room/v1/Room/room_entry_action"
            data = {
                "room_id": room_id,
                "platform": "pc"
            }
            
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Cookie": cookie,
                "Referer": f"https://live.bilibili.com/{room_id}"
            }
            
            response = requests.post(url, data=data, headers=headers)
            result = response.json()
            
            if result.get('code') == 0:
                self.app.log(f"[{remark}] 成功进入直播间 {room_id}")
            else:
                self.app.log(f"[{remark}] 进入直播间 {room_id} 失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.app.log(f"[{remark}] 进入直播间 {room_id} 失败: {str(e)}")
    
    def get_danmu_info(self, room_id, cookie, remark):
        try:
            url = f"https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id={room_id}&type=0"
            headers = {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            response = requests.get(url, headers=headers)
            result = response.json()
            
            if result.get('code') == 0 and result.get('data'):
                return result['data']
            else:
                self.app.log(f"[{remark}] Web获取弹幕信息失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.app.log(f"[{remark}] 获取直播间 {room_id} 弹幕信息失败: {str(e)}")
        
        return None
    
    def get_danmu_info_mobile(self, room_id, access_key, remark):
        try:
            url = "https://api.live.bilibili.com/xlive/app-room/v1/index/getDanmuInfo"
            appkey = "4409e2ce8ffd12b8"
            appsecret = "59b43e04ad6965f34319062b478f83dd"
            
            ts = int(time.time())
            params = {
                "access_key": access_key,
                "actionKey": "appkey",
                "appkey": appkey,
                "room_id": room_id,
                "ts": ts
            }
            
            sign = self.sign_bilibili_params(params, appsecret)
            params["sign"] = sign
            
            headers = {
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2"
            }
            
            response = requests.get(url, params=params, headers=headers)
            
            # 检查响应状态码
            if response.status_code != 200:
                self.app.log(f"[{remark}] 移动端获取弹幕信息失败: HTTP {response.status_code}")
                return None
            
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                self.app.log(f"[{remark}] 移动端获取弹幕信息失败: 无法解析JSON响应 - {str(e)}")
                self.app.log(f"[{remark}] 响应内容: {response.text[:200]}...")
                return None
            
            if result.get('code') == 0 and result.get('data'):
                return result['data']
            else:
                self.app.log(f"[{remark}] 移动端获取弹幕信息失败: {result.get('message', '未知错误')}")
                self.app.log(f"[{remark}] 响应: {json.dumps(result, ensure_ascii=False)}")
        except Exception as e:
            self.app.log(f"[{remark}] 获取移动端弹幕信息失败: {str(e)}")
        
        return None
    
    def web_heartbeat(self, access_key, room_id, cookie, remark):
        try:
            url = "https://live-trace.bilibili.com/xlive/rdata-interface/v1/heartbeat/webHeartBeat"
            hb = f"60|{room_id}|1|0"
            import base64
            hb_encoded = base64.b64encode(hb.encode('utf-8')).decode('utf-8')
            
            params = {
                "hb": hb_encoded,
                "pf": "web"
            }
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Cookie": cookie,
                "Referer": f"https://live.bilibili.com/{room_id}"
            }
            
            response = requests.get(url, params=params, headers=headers)
            
            # 检查响应状态码
            if response.status_code != 200:
                self.app.log(f"[{remark}] 直播间 {room_id} 心跳发送失败: HTTP {response.status_code}")
                return
            
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                self.app.log(f"[{remark}] 直播间 {room_id} 心跳发送失败: 无法解析JSON响应 - {str(e)}")
                return
            
            if result.get('code') == 0:
                # self.app.log(f"[{remark}] 直播间 {room_id} 心跳发送成功")
                pass
            else:
                self.app.log(f"[{remark}] 直播间 {room_id} 心跳发送失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.app.log(f"[{remark}] 直播间 {room_id} 心跳发送失败: {str(e)}")
    

    
    def sign_bilibili_params(self, params, appsecret):
        sorted_keys = sorted(params.keys())
        query_string = "&".join([f"{key}={params[key]}" for key in sorted_keys])
        sign = hashlib.md5((query_string + appsecret).encode()).hexdigest()
        return sign

if __name__ == "__main__":
    # 启动时清理上次更新残留的 .old 文件
    if getattr(sys, 'frozen', False):
        old_backup = sys.executable + ".old"
        if os.path.exists(old_backup):
            try:
                os.remove(old_backup)
            except Exception:
                pass

    app = BiliBarrageSender()
    app.run()