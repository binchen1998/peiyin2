#!/usr/bin/env python3
"""
修改后台管理用户名和密码的脚本
使用方法: python change_password.py
"""

import json
import os
import getpass

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "admin_config.json")

def load_config():
    """加载配置"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"username": "admin", "password": "admin123"}

def save_config(config):
    """保存配置"""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def main():
    print("=" * 40)
    print("  后台管理账号密码修改工具")
    print("=" * 40)
    print()
    
    config = load_config()
    print(f"当前用户名: {config['username']}")
    print()
    
    # 选择操作
    print("请选择操作:")
    print("1. 修改用户名")
    print("2. 修改密码")
    print("3. 同时修改用户名和密码")
    print("4. 查看当前配置")
    print("0. 退出")
    print()
    
    choice = input("请输入选项 (0-4): ").strip()
    
    if choice == "0":
        print("退出")
        return
    
    if choice == "4":
        print(f"\n当前用户名: {config['username']}")
        print(f"当前密码: {config['password']}")
        return
    
    if choice in ["1", "3"]:
        new_username = input("请输入新用户名: ").strip()
        if new_username:
            config["username"] = new_username
            print(f"用户名已更新为: {new_username}")
        else:
            print("用户名不能为空，保持原用户名")
    
    if choice in ["2", "3"]:
        new_password = getpass.getpass("请输入新密码: ")
        if new_password:
            confirm_password = getpass.getpass("请确认新密码: ")
            if new_password == confirm_password:
                config["password"] = new_password
                print("密码已更新")
            else:
                print("两次输入的密码不一致，密码未更新")
        else:
            print("密码不能为空，保持原密码")
    
    if choice in ["1", "2", "3"]:
        save_config(config)
        print("\n配置已保存!")
        print(f"用户名: {config['username']}")
        print("密码: ******")

if __name__ == "__main__":
    main()
