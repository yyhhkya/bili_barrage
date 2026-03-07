import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import requests
import json
import time
import threading
import schedule
import random
import hashlib
import websocket
import queue
import struct
import os

class BiliBarrageSender:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("B站弹幕助手 v1.0.0")
        self.root.geometry("800x600")
        
        # 账号管理
        self.accounts = []
        # 任务列表
        self.tasks = []
        # 消息队列
        self.message_queue = queue.Queue()
        # 直播间连接管理器
        self.watch_manager = WatchManager(self)
        
        # 日志管理
        self.logs_dir = "logs"
        self.current_log_file = None
        self.log_file_lock = threading.Lock()
        self._ensure_logs_dir()
        self._update_log_file()
        
        # 加载配置
        self.load_config()
        
        # 创建界面
        self.create_ui()
        
        # 启动消息处理线程
        self.message_thread = threading.Thread(target=self.process_messages, daemon=True)
        self.message_thread.start()
        
        # 启动定时任务线程
        self.schedule_thread = threading.Thread(target=self.run_schedule, daemon=True)
        self.schedule_thread.start()
    
    def _ensure_logs_dir(self):
        """确保logs目录存在"""
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)
    
    def _update_log_file(self):
        """更新当前日志文件路径"""
        today = time.strftime("%Y-%m-%d")
        # 查找今天的日志文件，找到最大的序号
        max_seq = 0
        for file in os.listdir(self.logs_dir):
            if file.startswith(f"{today}-") and file.endswith(".log"):
                try:
                    seq = int(file.split("-")[-1].split(".")[0])
                    if seq > max_seq:
                        max_seq = seq
                except ValueError:
                    pass
        # 新的日志文件序号
        new_seq = max_seq + 1
        self.current_log_file = os.path.join(self.logs_dir, f"{today}-{new_seq}.log")
        self.log(f"开始使用新的日志文件: {self.current_log_file}")
    
    def create_ui(self):
        # 创建标签页
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # 账号管理标签页
        account_frame = ttk.Frame(notebook)
        notebook.add(account_frame, text="账号管理")
        self.create_account_tab(account_frame)
        
        # 发送弹幕标签页
        send_frame = ttk.Frame(notebook)
        notebook.add(send_frame, text="发送弹幕")
        self.create_send_tab(send_frame)
        
        # 定时任务标签页
        task_frame = ttk.Frame(notebook)
        notebook.add(task_frame, text="定时任务")
        self.create_task_tab(task_frame)
        
        # 日志标签页
        log_frame = ttk.Frame(notebook)
        notebook.add(log_frame, text="日志")
        self.create_log_tab(log_frame)
    
    def create_account_tab(self, parent):
        # 账号列表
        account_frame = ttk.LabelFrame(parent, text="账号列表")
        account_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # 账号树
        columns = ("nickname", "key")
        self.account_tree = ttk.Treeview(account_frame, columns=columns, show="headings")
        self.account_tree.heading("nickname", text="昵称")
        self.account_tree.heading("key", text="Access Key")
        self.account_tree.column("nickname", width=150)
        self.account_tree.column("key", width=300)
        self.account_tree.pack(fill=tk.BOTH, expand=True)
        
        # 滚动条
        scrollbar = ttk.Scrollbar(self.account_tree, orient=tk.VERTICAL, command=self.account_tree.yview)
        self.account_tree.configure(yscroll=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 按钮
        button_frame = ttk.Frame(parent)
        button_frame.pack(fill=tk.X, padx=10, pady=5)
        
        add_button = ttk.Button(button_frame, text="添加账号", command=self.add_account)
        add_button.pack(side=tk.LEFT, padx=5)
        
        edit_button = ttk.Button(button_frame, text="编辑账号", command=self.edit_account)
        edit_button.pack(side=tk.LEFT, padx=5)
        
        delete_button = ttk.Button(button_frame, text="删除账号", command=self.delete_account)
        delete_button.pack(side=tk.LEFT, padx=5)
        
        # 刷新账号列表
        self.refresh_account_list()
    
    def create_send_tab(self, parent):
        # 发送设置
        send_frame = ttk.LabelFrame(parent, text="发送设置")
        send_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # 房间号
        room_id_frame = ttk.Frame(send_frame)
        room_id_frame.pack(fill=tk.X, padx=10, pady=5)
        ttk.Label(room_id_frame, text="房间号:", width=10).pack(side=tk.LEFT)
        self.room_id_var = tk.StringVar()
        ttk.Entry(room_id_frame, textvariable=self.room_id_var, width=20).pack(side=tk.LEFT)
        
        # 弹幕内容
        content_frame = ttk.Frame(send_frame)
        content_frame.pack(fill=tk.X, padx=10, pady=5)
        ttk.Label(content_frame, text="弹幕内容:", width=10).pack(side=tk.LEFT)
        self.content_var = tk.StringVar()
        ttk.Entry(content_frame, textvariable=self.content_var, width=50).pack(side=tk.LEFT)
        
        # 选择账号
        account_frame_container = ttk.LabelFrame(send_frame, text="选择账号")
        account_frame_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # 创建带滚动条的框架
        canvas = tk.Canvas(account_frame_container)
        scrollbar = ttk.Scrollbar(account_frame_container, orient=tk.VERTICAL, command=canvas.yview)
        self.account_frame = ttk.Frame(canvas)
        
        # 配置画布和滚动条
        self.account_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.account_frame, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # 放置画布和滚动条
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 发送按钮
        send_button = ttk.Button(send_frame, text="发送弹幕", command=self.send_danmaku)
        send_button.pack(pady=10)
        
        # 初始化账号选择列表
        self.refresh_send_accounts()
    
    def refresh_send_accounts(self):
        # 清空账号选择区域
        for widget in self.account_frame.winfo_children():
            widget.destroy()
        
        # 全选按钮
        button_frame = ttk.Frame(self.account_frame)
        button_frame.pack(fill=tk.X, padx=10, pady=5)
        ttk.Button(button_frame, text="全选", command=self.select_all_accounts).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消全选", command=self.deselect_all_accounts).pack(side=tk.LEFT, padx=5)
        
        # 重新生成账号选择列表
        self.account_vars = []
        for account in self.accounts:
            var = tk.BooleanVar()
            self.account_vars.append((account, var))
            ttk.Checkbutton(self.account_frame, text=account.get("nickname", account.get("remark", "")), variable=var).pack(anchor=tk.W, padx=10, pady=2)
    
    def create_task_tab(self, parent):
        # 任务列表
        task_frame = ttk.LabelFrame(parent, text="定时任务")
        task_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # 任务树
        columns = ("room_remark", "room_id", "content", "accounts", "interval", "status")
        self.task_tree = ttk.Treeview(task_frame, columns=columns, show="headings")
        self.task_tree.heading("room_remark", text="房间备注")
        self.task_tree.heading("room_id", text="房间号")
        self.task_tree.heading("content", text="弹幕内容")
        self.task_tree.heading("accounts", text="账号")
        self.task_tree.heading("interval", text="间隔(分钟)")
        self.task_tree.heading("status", text="状态")
        self.task_tree.column("room_remark", width=120)
        self.task_tree.column("room_id", width=100)
        self.task_tree.column("content", width=180)
        self.task_tree.column("accounts", width=150)
        self.task_tree.column("interval", width=100)
        self.task_tree.column("status", width=80)
        self.task_tree.pack(fill=tk.BOTH, expand=True)
        
        # 滚动条
        scrollbar = ttk.Scrollbar(self.task_tree, orient=tk.VERTICAL, command=self.task_tree.yview)
        self.task_tree.configure(yscroll=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 按钮
        button_frame = ttk.Frame(parent)
        button_frame.pack(fill=tk.X, padx=10, pady=5)
        
        add_task_button = ttk.Button(button_frame, text="添加任务", command=self.add_task)
        add_task_button.pack(side=tk.LEFT, padx=5)
        
        edit_task_button = ttk.Button(button_frame, text="编辑任务", command=self.edit_task)
        edit_task_button.pack(side=tk.LEFT, padx=5)
        
        delete_task_button = ttk.Button(button_frame, text="删除任务", command=self.delete_task)
        delete_task_button.pack(side=tk.LEFT, padx=5)
        
        start_task_button = ttk.Button(button_frame, text="启动任务", command=self.start_task)
        start_task_button.pack(side=tk.LEFT, padx=5)
        
        stop_task_button = ttk.Button(button_frame, text="停止任务", command=self.stop_task)
        stop_task_button.pack(side=tk.LEFT, padx=5)
        
        # 刷新任务列表
        self.refresh_task_list()
    
    def create_log_tab(self, parent):
        # 日志文本框
        log_frame = ttk.LabelFrame(parent, text="日志")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.log_text = tk.Text(log_frame, wrap=tk.WORD)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # 滚动条
        scrollbar = ttk.Scrollbar(self.log_text, orient=tk.VERTICAL, command=self.log_text.yview)
        self.log_text.configure(yscroll=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    
    def add_account(self):
        # 创建添加账号对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("添加账号")
        dialog.geometry("400x120")
        
        # Access Key输入
        key_frame = ttk.Frame(dialog)
        key_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(key_frame, text="Access Key:", width=10).pack(side=tk.LEFT)
        key_var = tk.StringVar()
        ttk.Entry(key_frame, textvariable=key_var, width=30).pack(side=tk.LEFT)
        
        # 昵称变量（用于扫码登录后自动获取）
        nickname_var = tk.StringVar()
        
        # 扫码登录按钮
        button_frame = ttk.Frame(dialog)
        button_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Button(button_frame, text="扫码登录", command=lambda: threading.Thread(target=self.scan_login, args=(key_var, nickname_var), daemon=True).start()).pack(side=tk.LEFT, padx=5)
        
        # 确定和取消按钮
        def save_account():
            key = key_var.get()
            if not key:
                messagebox.showinfo("提示", "请输入Access Key")
                return
            
            # 自动获取昵称
            nickname_var = tk.StringVar()
            self.get_user_nickname(key_var, nickname_var)
            nickname = nickname_var.get()
            if not nickname:
                messagebox.showinfo("提示", "无法获取账号昵称，请检查Access Key是否正确")
                return
            
            self.accounts.append({"nickname": nickname, "key": key})
            self.save_config()
            self.refresh_account_list()
            self.refresh_send_accounts()
            self.log(f"添加账号: {nickname}")
            dialog.destroy()
        
        ttk.Button(button_frame, text="确定", command=save_account).pack(side=tk.RIGHT, padx=5)
        ttk.Button(button_frame, text="取消", command=dialog.destroy).pack(side=tk.RIGHT, padx=5)
    
    def edit_account(self):
        selected = self.account_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要编辑的账号")
            return
        
        item = selected[0]
        values = self.account_tree.item(item, "values")
        old_nickname, old_key = values
        
        # 创建编辑账号对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("编辑账号")
        dialog.geometry("400x200")
        
        # 昵称输入（自动获取）
        nickname_frame = ttk.Frame(dialog)
        nickname_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(nickname_frame, text="账号昵称:", width=10).pack(side=tk.LEFT)
        nickname_var = tk.StringVar(value=old_nickname)
        nickname_entry = ttk.Entry(nickname_frame, textvariable=nickname_var, width=30)
        nickname_entry.pack(side=tk.LEFT)
        
        # 自动获取昵称按钮
        ttk.Button(nickname_frame, text="自动获取", command=lambda: self.get_user_nickname(key_var, nickname_var)).pack(side=tk.LEFT, padx=5)
        
        # Access Key输入
        key_frame = ttk.Frame(dialog)
        key_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(key_frame, text="Access Key:", width=10).pack(side=tk.LEFT)
        key_var = tk.StringVar(value=old_key)
        ttk.Entry(key_frame, textvariable=key_var, width=30).pack(side=tk.LEFT)
        
        # 扫码登录按钮
        button_frame = ttk.Frame(dialog)
        button_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Button(button_frame, text="扫码登录", command=lambda: threading.Thread(target=self.scan_login, args=(key_var, nickname_var), daemon=True).start()).pack(side=tk.LEFT, padx=5)
        
        # 确定和取消按钮
        def save_account():
            nickname = nickname_var.get()
            key = key_var.get()
            if not key:
                messagebox.showinfo("提示", "请输入Access Key")
                return
            
            # 如果没有昵称，自动获取
            if not nickname:
                self.get_user_nickname(key_var, nickname_var)
                nickname = nickname_var.get()
                if not nickname:
                    messagebox.showinfo("提示", "无法获取账号昵称，请检查Access Key是否正确")
                    return
            
            # 更新账号信息
            for i, account in enumerate(self.accounts):
                account_nickname = account.get("nickname", account.get("remark", ""))
                if account_nickname == old_nickname and account["key"] == old_key:
                    self.accounts[i] = {"nickname": nickname, "key": key}
                    break
            
            self.save_config()
            self.refresh_account_list()
            self.refresh_send_accounts()
            self.log(f"编辑账号: {nickname}")
            dialog.destroy()
        
        ttk.Button(button_frame, text="确定", command=save_account).pack(side=tk.RIGHT, padx=5)
        ttk.Button(button_frame, text="取消", command=dialog.destroy).pack(side=tk.RIGHT, padx=5)
    
    def delete_account(self):
        selected = self.account_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要删除的账号")
            return
        
        item = selected[0]
        values = self.account_tree.item(item, "values")
        nickname, key = values
        
        if messagebox.askyesno("确认", f"确定要删除账号 {nickname} 吗？"):
            # 删除账号
            self.accounts = [account for account in self.accounts if not (account.get("nickname", account.get("remark", "")) == nickname and account["key"] == key)]
            self.save_config()
            self.refresh_account_list()
            self.refresh_send_accounts()
            self.log(f"删除账号: {nickname}")
    
    def add_task(self):
        # 创建任务对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("添加定时任务")
        dialog.geometry("500x400")
        
        # 房间备注
        room_remark_frame = ttk.Frame(dialog)
        room_remark_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(room_remark_frame, text="房间备注:", width=10).pack(side=tk.LEFT)
        room_remark_var = tk.StringVar()
        ttk.Entry(room_remark_frame, textvariable=room_remark_var, width=30).pack(side=tk.LEFT)
        
        # 房间号
        room_id_frame = ttk.Frame(dialog)
        room_id_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(room_id_frame, text="房间号:", width=10).pack(side=tk.LEFT)
        room_id_var = tk.StringVar()
        ttk.Entry(room_id_frame, textvariable=room_id_var, width=30).pack(side=tk.LEFT)
        
        # 弹幕内容（数组，用逗号分隔）
        content_frame = ttk.Frame(dialog)
        content_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(content_frame, text="弹幕内容:", width=10).pack(side=tk.LEFT)
        content_var = tk.StringVar()
        ttk.Entry(content_frame, textvariable=content_var, width=30).pack(side=tk.LEFT)
        ttk.Label(content_frame, text="(多个弹幕用逗号分隔)", font=('Arial', 8)).pack(side=tk.LEFT, padx=5)
        
        # 发送间隔
        interval_frame = ttk.Frame(dialog)
        interval_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(interval_frame, text="发送间隔(分钟):", width=15).pack(side=tk.LEFT)
        interval_var = tk.StringVar(value="10")
        ttk.Entry(interval_frame, textvariable=interval_var, width=10).pack(side=tk.LEFT)
        
        # 选择账号
        account_frame = ttk.LabelFrame(dialog, text="选择账号")
        account_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        # 初始化账号变量列表
        account_vars = []
        
        # 全选按钮
        button_frame = ttk.Frame(account_frame)
        button_frame.pack(fill=tk.X, padx=10, pady=5)
        
        def select_all():
            for account, var in account_vars:
                var.set(True)
        
        def deselect_all():
            for account, var in account_vars:
                var.set(False)
        
        ttk.Button(button_frame, text="全选", command=select_all).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消全选", command=deselect_all).pack(side=tk.LEFT, padx=5)
        
        # 添加账号复选框
        for account in self.accounts:
            var = tk.BooleanVar()
            account_vars.append((account, var))
            ttk.Checkbutton(account_frame, text=account.get("nickname", account.get("remark", "")), variable=var).pack(anchor=tk.W, padx=10, pady=2)
        
        # 按钮
        button_frame = ttk.Frame(dialog)
        button_frame.pack(fill=tk.X, padx=20, pady=10)
        
        def save_task():
            room_id = room_id_var.get()
            content = content_var.get()
            interval = interval_var.get()
            
            if not room_id or not content or not interval:
                messagebox.showinfo("提示", "请填写完整信息")
                return
            
            try:
                interval = int(interval)
                if interval <= 0:
                    raise ValueError
            except ValueError:
                messagebox.showinfo("提示", "发送间隔必须是正整数")
                return
            
            selected_accounts = [account for account, var in account_vars if var.get()]
            if not selected_accounts:
                messagebox.showinfo("提示", "请至少选择一个账号")
                return
            
            # 创建任务
            task = {
                "id": len(self.tasks) + 1,
                "room_id": room_id,
                "room_remark": room_remark_var.get(),
                "content": content,
                "accounts": [acc.get("nickname", acc.get("remark", "")) for acc in selected_accounts],
                "account_keys": [acc["key"] for acc in selected_accounts],
                "interval": interval,
                "status": "停止",
                "job_id": None,
                "current_content_index": 0  # 当前发送的弹幕索引
            }
            
            self.tasks.append(task)
            self.save_config()
            self.refresh_task_list()
            self.log(f"添加定时任务: 房间 {room_id}, 间隔 {interval} 分钟")
            dialog.destroy()
        
        save_button = ttk.Button(button_frame, text="保存", command=save_task)
        save_button.pack(side=tk.LEFT, padx=10)
        
        cancel_button = ttk.Button(button_frame, text="取消", command=dialog.destroy)
        cancel_button.pack(side=tk.LEFT, padx=10)
    
    def edit_task(self):
        selected = self.task_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要编辑的任务")
            return
        
        item = selected[0]
        task_id = int(self.task_tree.item(item, "text"))
        task = next((t for t in self.tasks if t["id"] == task_id), None)
        if not task:
            return
        
        # 创建任务对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("编辑定时任务")
        dialog.geometry("500x400")
        
        # 房间备注
        room_remark_frame = ttk.Frame(dialog)
        room_remark_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(room_remark_frame, text="房间备注:", width=10).pack(side=tk.LEFT)
        room_remark_var = tk.StringVar(value=task.get("room_remark", ""))
        ttk.Entry(room_remark_frame, textvariable=room_remark_var, width=30).pack(side=tk.LEFT)
        
        # 房间号
        room_id_frame = ttk.Frame(dialog)
        room_id_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(room_id_frame, text="房间号:", width=10).pack(side=tk.LEFT)
        room_id_var = tk.StringVar(value=task["room_id"])
        ttk.Entry(room_id_frame, textvariable=room_id_var, width=30).pack(side=tk.LEFT)
        
        # 弹幕内容（数组，用逗号分隔）
        content_frame = ttk.Frame(dialog)
        content_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(content_frame, text="弹幕内容:", width=10).pack(side=tk.LEFT)
        content_var = tk.StringVar(value=task["content"])
        ttk.Entry(content_frame, textvariable=content_var, width=30).pack(side=tk.LEFT)
        ttk.Label(content_frame, text="(多个弹幕用逗号分隔)", font=('Arial', 8)).pack(side=tk.LEFT, padx=5)
        
        # 发送间隔
        interval_frame = ttk.Frame(dialog)
        interval_frame.pack(fill=tk.X, padx=20, pady=10)
        ttk.Label(interval_frame, text="发送间隔(分钟):", width=15).pack(side=tk.LEFT)
        interval_var = tk.StringVar(value=str(task["interval"]))
        ttk.Entry(interval_frame, textvariable=interval_var, width=10).pack(side=tk.LEFT)
        
        # 选择账号
        account_frame = ttk.LabelFrame(dialog, text="选择账号")
        account_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        # 初始化账号变量列表
        account_vars = []
        
        # 全选按钮
        button_frame = ttk.Frame(account_frame)
        button_frame.pack(fill=tk.X, padx=10, pady=5)
        
        def select_all():
            for account, var in account_vars:
                var.set(True)
        
        def deselect_all():
            for account, var in account_vars:
                var.set(False)
        
        ttk.Button(button_frame, text="全选", command=select_all).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消全选", command=deselect_all).pack(side=tk.LEFT, padx=5)
        
        # 添加账号复选框
        for account in self.accounts:
            account_nickname = account.get("nickname", account.get("remark", ""))
            var = tk.BooleanVar(value=account_nickname in task["accounts"])
            account_vars.append((account, var))
            ttk.Checkbutton(account_frame, text=account_nickname, variable=var).pack(anchor=tk.W, padx=10, pady=2)
        
        # 按钮
        button_frame = ttk.Frame(dialog)
        button_frame.pack(fill=tk.X, padx=20, pady=10)
        
        def save_task():
            room_id = room_id_var.get()
            content = content_var.get()
            interval = interval_var.get()
            
            if not room_id or not content or not interval:
                messagebox.showinfo("提示", "请填写完整信息")
                return
            
            try:
                interval = int(interval)
                if interval <= 0:
                    raise ValueError
            except ValueError:
                messagebox.showinfo("提示", "发送间隔必须是正整数")
                return
            
            selected_accounts = [account for account, var in account_vars if var.get()]
            if not selected_accounts:
                messagebox.showinfo("提示", "请至少选择一个账号")
                return
            
            # 停止原任务
            if task["job_id"]:
                schedule.cancel_job(task["job_id"])
            
            # 更新任务
            task["room_id"] = room_id
            task["room_remark"] = room_remark_var.get()
            task["content"] = content
            task["accounts"] = [acc.get("nickname", acc.get("remark", "")) for acc in selected_accounts]
            task["account_keys"] = [acc["key"] for acc in selected_accounts]
            task["interval"] = interval
            task["status"] = "停止"
            task["job_id"] = None
            task["current_content_index"] = 0  # 重置弹幕索引
            
            self.save_config()
            self.refresh_task_list()
            self.log(f"编辑定时任务: 房间 {room_id}, 间隔 {interval} 分钟")
            dialog.destroy()
        
        save_button = ttk.Button(button_frame, text="保存", command=save_task)
        save_button.pack(side=tk.LEFT, padx=10)
        
        cancel_button = ttk.Button(button_frame, text="取消", command=dialog.destroy)
        cancel_button.pack(side=tk.LEFT, padx=10)
    
    def delete_task(self):
        selected = self.task_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要删除的任务")
            return
        
        item = selected[0]
        task_id = int(self.task_tree.item(item, "text"))
        task = next((t for t in self.tasks if t["id"] == task_id), None)
        if not task:
            return
        
        if messagebox.askyesno("确认", f"确定要删除任务 {task['room_id']} 吗？"):
            # 停止任务
            if task["job_id"]:
                schedule.cancel_job(task["job_id"])
            
            # 删除任务
            self.tasks = [t for t in self.tasks if t["id"] != task_id]
            self.save_config()
            self.refresh_task_list()
            self.log(f"删除定时任务: 房间 {task['room_id']}")
    
    def start_task(self):
        selected = self.task_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要启动的任务")
            return
        
        item = selected[0]
        task_id = int(self.task_tree.item(item, "text"))
        task = next((t for t in self.tasks if t["id"] == task_id), None)
        if not task:
            return
        
        if task["status"] == "运行中":
            messagebox.showinfo("提示", "任务已经在运行中")
            return
        
        # 先更新任务状态，避免重复点击
        task["status"] = "启动中"
        self.refresh_task_list()
        
        # 在单独线程中执行启动逻辑
        threading.Thread(target=self._start_task_thread, args=(task,), daemon=True).start()
    
    def _start_task_thread(self, task):
        """启动任务（在单独线程中执行）"""
        try:
            # 获取直播间信息，包括主播UID
            up_id = self.get_room_up_id(task["room_id"])
            if not up_id:
                self.log(f"无法获取直播间 {task['room_id']} 的主播信息，任务启动失败")
                task["status"] = "停止"
                self.refresh_task_list()
                return
            
            # 为每个账号启动直播间连接
            for key in task["account_keys"]:
                account = next((acc for acc in self.accounts if acc["key"] == key), None)
                if account:
                    account_nickname = account.get("nickname", account.get("remark", ""))
                    self.watch_manager.start_watch(key, task["room_id"], up_id, account_nickname)
                    time.sleep(1)  # 账号间间隔
            
            # 创建定时任务
            def job():
                # 解析弹幕数组
                contents = [c.strip() for c in task["content"].split(",") if c.strip()]
                if not contents:
                    self.log(f"定时任务 {task['room_id']} 没有有效的弹幕内容")
                    return
                
                # 获取当前弹幕
                current_index = task.get("current_content_index", 0)
                current_content = contents[current_index]
                
                # 所有账号发送相同的弹幕
                for key in task["account_keys"]:
                    account = next((acc for acc in self.accounts if acc["key"] == key), None)
                    if account:
                        self.send_danmaku_to_room(account, task["room_id"], current_content)
                        time.sleep(2)  # 账号间间隔
                
                # 更新弹幕索引
                task["current_content_index"] = (current_index + 1) % len(contents)
            
            # 立即执行一次
            job()
            
            # 设置定时
            job_id = schedule.every(task["interval"]).minutes.do(job)
            task["job_id"] = job_id
            task["status"] = "运行中"
            task["up_id"] = up_id  # 保存主播UID
            
            self.save_config()
            self.refresh_task_list()
            self.log(f"启动定时任务: 房间 {task['room_id']}, 间隔 {task['interval']} 分钟")
        except Exception as e:
            self.log(f"启动任务失败: {str(e)}")
            task["status"] = "停止"
            self.refresh_task_list()
    
    def stop_task(self):
        selected = self.task_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请选择要停止的任务")
            return
        
        item = selected[0]
        task_id = int(self.task_tree.item(item, "text"))
        task = next((t for t in self.tasks if t["id"] == task_id), None)
        if not task:
            return
        
        if task["status"] == "停止":
            messagebox.showinfo("提示", "任务已经停止")
            return
        
        # 先更新任务状态，避免重复点击
        task["status"] = "停止中"
        self.refresh_task_list()
        
        # 在单独线程中执行停止逻辑
        threading.Thread(target=self._stop_task_thread, args=(task,), daemon=True).start()
    
    def _stop_task_thread(self, task):
        """停止任务（在单独线程中执行）"""
        try:
            # 停止任务
            if task["job_id"]:
                schedule.cancel_job(task["job_id"])
            
            # 停止所有账号的直播间连接
            for key in task["account_keys"]:
                self.watch_manager.stop_watch(key, task["room_id"])
                time.sleep(0.5)  # 账号间间隔
            
            task["status"] = "停止"
            task["job_id"] = None
            
            self.save_config()
            self.refresh_task_list()
            self.log(f"停止定时任务: 房间 {task['room_id']}")
        except Exception as e:
            self.log(f"停止任务失败: {str(e)}")
            task["status"] = "运行中"  # 恢复状态
            self.refresh_task_list()
    
    def scan_login(self, key_var, nickname_var=None):
        """扫码登录获取Access Key"""
        try:
            # 检查必要的依赖
            self.install_dependencies()
            
            self.log("开始扫码登录...")
            
            # 生成二维码登录链接和auth_code
            qrcode_url, auth_code = self.get_tv_qrcode_url_and_auth_code()
            
            # 登录状态标志
            self.login_cancelled = False
            
            # 在主线程中显示二维码
            self.root.after(0, lambda: self.show_qrcode(qrcode_url))
            
            # 轮询登录状态
            access_key = self.verify_login(auth_code)
            
            if access_key:
                # 保存到文件
                with open("login_info.txt", "w", encoding="utf-8") as f:
                    f.write(access_key)
                
                # 在主线程中更新UI
                self.root.after(0, lambda: self._update_login_success(key_var, access_key, nickname_var))
            else:
                # 检查是否是用户主动关闭了二维码窗口
                if self.login_cancelled:
                    # 用户主动关闭了窗口，不提示失败
                    self.log("用户主动关闭了二维码窗口，登录流程已取消")
                else:
                    # 其他原因导致登录失败，显示提示
                    self.root.after(0, lambda: messagebox.showinfo("提示", "扫码登录失败，请重试"))
                    self.log("扫码登录失败，未获取到Access Key")
                
        except Exception as e:
            self.log(f"扫码登录失败: {str(e)}")
            # 在主线程中显示错误
            self.root.after(0, lambda: messagebox.showinfo("提示", f"扫码登录失败: {str(e)}"))
        finally:
            # 清理登录状态标志
            if hasattr(self, "login_cancelled"):
                delattr(self, "login_cancelled")
    
    def _update_login_success(self, key_var, access_key, nickname_var=None):
        """在主线程中更新登录成功的UI"""
        key_var.set(access_key)
        self.log("扫码登录成功，Access Key已自动填入")
        # 自动获取昵称
        if nickname_var:
            self.get_user_nickname(key_var, nickname_var)
            # 延迟添加账号，确保昵称已获取
            self.root.after(1000, lambda: self.auto_add_account(key_var, nickname_var))
        messagebox.showinfo("提示", "扫码登录成功！Access Key已自动填入")
    
    def auto_add_account(self, key_var, nickname_var):
        """自动添加账号"""
        key = key_var.get()
        nickname = nickname_var.get()
        if key and nickname:
            # 检查账号是否已存在
            existing_accounts = [acc.get("key") for acc in self.accounts]
            if key not in existing_accounts:
                self.accounts.append({"nickname": nickname, "key": key})
                self.save_config()
                self.refresh_account_list()
                self.refresh_send_accounts()
                self.log(f"自动添加账号: {nickname}")
            else:
                self.log(f"账号已存在: {nickname}")
    
    def get_user_nickname(self, key_var, nickname_var):
        """根据Access Key获取用户昵称"""
        try:
            access_key = key_var.get()
            if not access_key:
                messagebox.showinfo("提示", "请先输入Access Key")
                return
            
            self.log("正在获取用户昵称...")
            
            # 调用B站API获取用户信息
            url = "https://app.bilibili.com/x/v2/account/mine"
            appkey = "4409e2ce8ffd12b8"
            appsec = "59b43e04ad6965f34319062b478f83dd"
            
            ts = int(time.time())
            params = {
                "access_key": access_key,
                "actionKey": "appkey",
                "appkey": appkey,
                "ts": ts
            }
            
            # 签名
            sorted_keys = sorted(params.keys())
            query = ""
            for k in sorted_keys:
                query += f"{k}={params[k]}&"
            query = query[:-1] + appsec
            sign = hashlib.md5(query.encode()).hexdigest()
            params["sign"] = sign
            
            # 发送请求
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"API响应: {json.dumps(result, ensure_ascii=False)}")
                if result.get("code") == 0 and result.get("data"):
                    # 尝试从不同字段获取昵称
                    nickname = result["data"].get("name", "") or result["data"].get("uname", "") or result["data"].get("nickname", "") or result["data"].get("userinfo", {}).get("uname", "")
                    if nickname:
                        nickname_var.set(nickname)
                        self.log(f"获取用户昵称成功: {nickname}")
                    else:
                        self.log("获取用户昵称失败: 未找到昵称字段")
                        messagebox.showinfo("提示", "获取用户昵称失败: 未找到昵称字段")
                else:
                    self.log(f"获取用户昵称失败: {result.get('message', '未知错误')}")
                    messagebox.showinfo("提示", f"获取用户昵称失败: {result.get('message', '未知错误')}")
            else:
                self.log(f"获取用户昵称失败: HTTP {response.status_code}")
                messagebox.showinfo("提示", f"获取用户昵称失败: HTTP {response.status_code}")
                
        except Exception as e:
            self.log(f"获取用户昵称失败: {str(e)}")
            messagebox.showinfo("提示", f"获取用户昵称失败: {str(e)}")
    
    def install_dependencies(self):
        """检查必要的依赖"""
        try:
            import qrcode
            import PIL
        except ImportError:
            raise Exception("缺少必要的依赖，请安装: qrcode[pil] 和 Pillow")
    
    def get_tv_qrcode_url_and_auth_code(self):
        """获取电视端二维码登录链接和auth_code"""
        url = "http://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code"
        appkey = "4409e2ce8ffd12b8"
        appsec = "59b43e04ad6965f34319062b478f83dd"
        
        data = {
            "local_id": "0",
            "ts": str(int(time.time()))
        }
        
        # 签名
        data["appkey"] = appkey
        sorted_keys = sorted(data.keys())
        query = ""
        for k in sorted_keys:
            query += f"{k}={data[k]}&"
        query = query[:-1] + appsec
        sign = hashlib.md5(query.encode()).hexdigest()
        data["sign"] = sign
        
        # 发送请求
        try:
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            response = requests.post(url, data=data, headers=headers, timeout=10)
            
            self.log(f"API响应状态码: {response.status_code}")
            self.log(f"API响应内容: {response.text[:300]}...")
            
            if response.status_code != 200:
                raise Exception(f"API请求失败，状态码: {response.status_code}")
                
            result = response.json()
            
            if result.get("code") == 0:
                return result["data"]["url"], result["data"]["auth_code"]
            else:
                raise Exception(f"获取二维码失败: {result.get('message', '未知错误')}")
        except json.JSONDecodeError as e:
            raise Exception(f"JSON解析失败: {str(e)}，响应内容: {response.text[:300]}...")
        except Exception as e:
            raise Exception(f"获取二维码失败: {str(e)}")
    
    def show_qrcode(self, qrcode_url):
        """显示二维码"""
        import qrcode
        from PIL import Image, ImageTk
        
        # 生成二维码
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(qrcode_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # 保存临时图片
        temp_path = "qrcode.png"
        img.save(temp_path)
        
        # 创建对话框显示二维码
        dialog = tk.Toplevel(self.root)
        dialog.title("扫码登录")
        dialog.geometry("300x350")
        
        # 显示二维码
        img = Image.open(temp_path)
        img = img.resize((250, 250), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        label = ttk.Label(dialog, image=photo)
        label.image = photo  # 保持引用
        label.pack(pady=10)
        
        # 显示提示文字
        ttk.Label(dialog, text="请使用B站App扫码登录", justify=tk.CENTER).pack(pady=10)
        
        # 保持对话框显示
        self.qrcode_dialog = dialog
        
        # 当对话框关闭时，清除属性、设置取消标志并关闭窗口
        def on_dialog_close():
            if hasattr(self, "qrcode_dialog"):
                delattr(self, "qrcode_dialog")
            # 设置登录取消标志
            if hasattr(self, "login_cancelled"):
                self.login_cancelled = True
            dialog.destroy()
        
        dialog.protocol("WM_DELETE_WINDOW", on_dialog_close)
    
    def verify_login(self, auth_code):
        """轮询登录状态"""
        url = "http://passport.bilibili.com/x/passport-tv-login/qrcode/poll"
        appkey = "4409e2ce8ffd12b8"
        appsec = "59b43e04ad6965f34319062b478f83dd"
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        while True:
            # 检查是否用户取消了登录
            if hasattr(self, "login_cancelled") and self.login_cancelled:
                self.log("用户取消了登录，停止登录状态查询")
                return None
            
            # 检查二维码对话框是否已关闭
            try:
                if hasattr(self, "qrcode_dialog") and not self.qrcode_dialog.winfo_exists():
                    self.log("二维码窗口已关闭，停止登录状态查询")
                    return None
            except AttributeError:
                # qrcode_dialog属性已被删除，说明用户关闭了窗口
                self.log("二维码窗口已关闭，停止登录状态查询")
                return None
            
            data = {
                "auth_code": auth_code,
                "local_id": "0",
                "ts": str(int(time.time()))
            }
            
            # 签名
            data["appkey"] = appkey
            sorted_keys = sorted(data.keys())
            query = ""
            for k in sorted_keys:
                query += f"{k}={data[k]}&"
            query = query[:-1] + appsec
            sign = hashlib.md5(query.encode()).hexdigest()
            data["sign"] = sign
            
            # 发送请求
            try:
                response = requests.post(url, data=data, headers=headers, timeout=10)
                
                self.log(f"登录状态查询响应状态码: {response.status_code}")
                
                if response.status_code != 200:
                    self.log(f"登录状态查询失败，状态码: {response.status_code}")
                    time.sleep(3)
                    continue
                    
                result = response.json()
                
                self.log(f"登录状态查询: {result}")
                
                if result.get("code") == 0:
                    # 关闭二维码对话框
                    if hasattr(self, "qrcode_dialog") and self.qrcode_dialog.winfo_exists():
                        self.qrcode_dialog.destroy()
                    return result["data"]["access_token"]
                else:
                    # 等待3秒后重试
                    time.sleep(3)
            except json.JSONDecodeError as e:
                self.log(f"登录状态查询JSON解析失败: {str(e)}")
                time.sleep(3)
            except Exception as e:
                self.log(f"登录状态查询失败: {str(e)}")
                time.sleep(3)
    
    def run_command(self, command):
        """运行命令并返回结果"""
        import subprocess
        try:
            # 启动命令并等待完成
            process = subprocess.Popen(
                command, 
                shell=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True
            )
            
            # 读取输出
            stdout, stderr = process.communicate()
            
            # 输出到日志
            if stdout:
                self.log(f"命令输出: {stdout}")
            if stderr:
                self.log(f"命令错误: {stderr}")
            
            return stdout, stderr
        except Exception as e:
            self.log(f"运行命令失败: {str(e)}")
            return "", str(e)
    
    def select_all_accounts(self):
        for account, var in self.account_vars:
            var.set(True)
    
    def deselect_all_accounts(self):
        for account, var in self.account_vars:
            var.set(False)
    
    def send_danmaku(self):
        room_id = self.room_id_var.get()
        content = self.content_var.get()
        
        if not room_id or not content:
            messagebox.showinfo("提示", "请填写房间号和弹幕内容")
            return
        
        selected_accounts = [account for account, var in self.account_vars if var.get()]
        if not selected_accounts:
            messagebox.showinfo("提示", "请至少选择一个账号")
            return
        
        # 在后台线程中发送弹幕，避免阻塞主线程
        threading.Thread(target=self._send_danmaku_thread, args=(selected_accounts, room_id, content), daemon=True).start()
    
    def _send_danmaku_thread(self, selected_accounts, room_id, content):
        """在后台线程中发送弹幕"""
        for account in selected_accounts:
            self.send_danmaku_to_room(account, room_id, content)
            time.sleep(2)  # 账号间间隔
    
    def send_danmaku_to_room(self, account, room_id, content):
        try:
            account_nickname = account.get("nickname", account.get("remark", ""))
            self.log(f"[{account_nickname}] 尝试向房间 {room_id} 发送弹幕: {content}")
            
            # B站API参数
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
                "ts": ts
            }
            
            # 签名
            sign = self.sign_bilibili_params(params, appsecret)
            params["sign"] = sign
            
            # 发送请求
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2"
            }
            
            response = requests.post(url, data=params, headers=headers)
            result = response.json()
            
            if result.get("code") == 0:
                self.log(f"[{account_nickname}] 成功向房间 {room_id} 发送弹幕")
            else:
                self.log(f"[{account_nickname}] 发送失败: {result.get('message', '未知错误')}")
                
        except Exception as e:
            self.log(f"[{account_nickname}] 发送异常: {str(e)}")
    
    def sign_bilibili_params(self, params, appsecret):
        sorted_keys = sorted(params.keys())
        query_string = "&".join([f"{key}={params[key]}" for key in sorted_keys])
        sign = hashlib.md5((query_string + appsecret).encode()).hexdigest()
        return sign
    
    def refresh_account_list(self):
        # 清空树
        for item in self.account_tree.get_children():
            self.account_tree.delete(item)
        
        # 添加账号
        for account in self.accounts:
            self.account_tree.insert("", tk.END, values=(account.get("nickname", account.get("remark", "")), account["key"]))
    
    def refresh_task_list(self):
        # 清空树
        for item in self.task_tree.get_children():
            self.task_tree.delete(item)
        
        # 添加任务
        for task in self.tasks:
            accounts_str = ", ".join(task["accounts"])
            room_remark = task.get("room_remark", "")
            self.task_tree.insert("", tk.END, text=str(task["id"]), values=(room_remark, task["room_id"], task["content"], accounts_str, task["interval"], task["status"]))
    
    def log(self, message):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}\n"
        
        # 输出到界面
        self.message_queue.put(log_message)
        
        # 写入文件
        if self.current_log_file:
            with self.log_file_lock:
                try:
                    with open(self.current_log_file, "a", encoding="utf-8") as f:
                        f.write(log_message)
                except Exception as e:
                    # 如果写入失败，不影响程序运行
                    pass
    
    def process_messages(self):
        while True:
            try:
                message = self.message_queue.get(block=False)
                self.log_text.insert(tk.END, message)
                self.log_text.see(tk.END)
            except queue.Empty:
                time.sleep(0.1)
    
    def run_schedule(self):
        while True:
            schedule.run_pending()
            time.sleep(1)
    
    def load_config(self):
        try:
            with open("config.json", "r", encoding="utf-8") as f:
                config = json.load(f)
                self.accounts = config.get("accounts", [])
                self.tasks = config.get("tasks", [])
                
                # 恢复定时任务
                for task in self.tasks:
                    if task.get("status") == "运行中":
                        # 启动任务（在单独线程中执行）
                        threading.Thread(target=self._auto_start_task, args=(task,), daemon=True).start()
        except FileNotFoundError:
            # 配置文件不存在，使用默认值
            self.accounts = []
            self.tasks = []
        except Exception as e:
            self.log(f"加载配置失败: {str(e)}")
            self.accounts = []
            self.tasks = []
    
    def _auto_start_task(self, task):
        """自动启动任务（在单独线程中执行）"""
        try:
            # 获取直播间信息，包括主播UID
            up_id = self.get_room_up_id(task["room_id"])
            if not up_id:
                self.log(f"无法获取直播间 {task['room_id']} 的主播信息，任务启动失败")
                return
            
            # 为每个账号启动直播间连接
            for key in task["account_keys"]:
                account = next((acc for acc in self.accounts if acc["key"] == key), None)
                if account:
                    account_nickname = account.get("nickname", account.get("remark", ""))
                    self.watch_manager.start_watch(key, task["room_id"], up_id, account_nickname)
                    time.sleep(1)  # 账号间间隔
            
            # 创建定时任务
            def job():
                # 解析弹幕数组
                contents = [c.strip() for c in task["content"].split(",") if c.strip()]
                if not contents:
                    self.log(f"定时任务 {task['room_id']} 没有有效的弹幕内容")
                    return
                
                # 获取当前弹幕
                current_index = task.get("current_content_index", 0)
                current_content = contents[current_index]
                
                # 所有账号发送相同的弹幕
                for key in task["account_keys"]:
                    account = next((acc for acc in self.accounts if acc["key"] == key), None)
                    if account:
                        self.send_danmaku_to_room(account, task["room_id"], current_content)
                        time.sleep(2)  # 账号间间隔
                
                # 更新弹幕索引
                task["current_content_index"] = (current_index + 1) % len(contents)
            
            # 立即执行一次
            job()
            
            # 设置定时
            job_id = schedule.every(task["interval"]).minutes.do(job)
            task["job_id"] = job_id
            task["up_id"] = up_id  # 保存主播UID
            
            self.log(f"自动启动定时任务: 房间 {task['room_id']}, 间隔 {task['interval']} 分钟")
        except Exception as e:
            self.log(f"自动启动任务失败: {str(e)}")
    
    def get_room_up_id(self, room_id):
        try:
            url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            response = requests.get(url, headers=headers)
            result = response.json()
            
            if result.get('code') == 0 and result.get('data'):
                return result['data'].get('uid')
            else:
                self.log(f"获取直播间 {room_id} 信息失败: {result.get('message', '未知错误')}")
        except Exception as e:
            self.log(f"获取直播间 {room_id} 信息失败: {str(e)}")
        
        return None
    
    def save_config(self):
        try:
            # 移除运行时信息
            tasks_to_save = []
            for task in self.tasks:
                task_copy = task.copy()
                del task_copy["job_id"]  # 不保存job_id
                tasks_to_save.append(task_copy)
            
            config = {
                "accounts": self.accounts,
                "tasks": tasks_to_save
            }
            
            with open("config.json", "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self.log(f"保存配置失败: {str(e)}")
    
    def run(self):
        self.root.mainloop()

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
            'remark': remark
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
    app = BiliBarrageSender()
    app.run()