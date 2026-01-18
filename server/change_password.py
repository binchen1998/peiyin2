#!/usr/bin/env python3
"""
修改后台管理用户名和密码的脚本
使用方法: python change_password.py

数据库配置从 .env 文件读取，支持 SQLite 和 MySQL
"""

import os
import sys
import getpass

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from database import (
    init_db, get_db_session, AdminUser, 
    hash_password, change_admin_password, 
    change_admin_username, create_admin_user,
    DATABASE_URL
)


def list_admins(db):
    """列出所有管理员"""
    admins = db.query(AdminUser).all()
    if not admins:
        print("没有管理员用户")
        return []
    
    print("\n管理员列表:")
    print("-" * 40)
    for admin in admins:
        status = "✓ 启用" if admin.is_active else "✗ 禁用"
        print(f"  ID: {admin.id}, 用户名: {admin.username}, 状态: {status}")
    print("-" * 40)
    return admins


def main():
    print("=" * 50)
    print("  后台管理账号密码修改工具")
    print("=" * 50)
    print()
    print(f"数据库: {DATABASE_URL}")
    print()
    
    # 初始化数据库
    init_db()
    
    # 获取数据库会话
    db = get_db_session()
    
    try:
        # 检查是否有管理员
        admin_count = db.query(AdminUser).count()
        if admin_count == 0:
            print("数据库中没有管理员用户，正在创建默认管理员...")
            admin = AdminUser(
                username="admin",
                password_hash=hash_password("admin123"),
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("默认管理员已创建: admin / admin123")
            print()
        
        while True:
            # 显示管理员列表
            admins = list_admins(db)
            
            # 选择操作
            print("\n请选择操作:")
            print("1. 修改用户名")
            print("2. 修改密码")
            print("3. 创建新管理员")
            print("4. 启用/禁用管理员")
            print("5. 删除管理员")
            print("0. 退出")
            print()
            
            choice = input("请输入选项 (0-5): ").strip()
            
            if choice == "0":
                print("退出")
                break
            
            if choice == "1":
                # 修改用户名
                old_username = input("请输入要修改的用户名: ").strip()
                admin = db.query(AdminUser).filter(AdminUser.username == old_username).first()
                if not admin:
                    print(f"用户 '{old_username}' 不存在")
                    continue
                
                new_username = input("请输入新用户名: ").strip()
                if not new_username:
                    print("用户名不能为空")
                    continue
                
                if change_admin_username(db, old_username, new_username):
                    print(f"用户名已从 '{old_username}' 修改为 '{new_username}'")
                else:
                    print("修改失败，新用户名可能已存在")
            
            elif choice == "2":
                # 修改密码
                username = input("请输入要修改密码的用户名: ").strip()
                admin = db.query(AdminUser).filter(AdminUser.username == username).first()
                if not admin:
                    print(f"用户 '{username}' 不存在")
                    continue
                
                new_password = getpass.getpass("请输入新密码: ")
                if not new_password:
                    print("密码不能为空")
                    continue
                
                confirm_password = getpass.getpass("请确认新密码: ")
                if new_password != confirm_password:
                    print("两次输入的密码不一致")
                    continue
                
                if change_admin_password(db, username, new_password):
                    print(f"用户 '{username}' 的密码已修改")
                else:
                    print("密码修改失败")
            
            elif choice == "3":
                # 创建新管理员
                username = input("请输入新管理员用户名: ").strip()
                if not username:
                    print("用户名不能为空")
                    continue
                
                password = getpass.getpass("请输入密码: ")
                if not password:
                    print("密码不能为空")
                    continue
                
                confirm_password = getpass.getpass("请确认密码: ")
                if password != confirm_password:
                    print("两次输入的密码不一致")
                    continue
                
                admin = create_admin_user(db, username, password)
                if admin:
                    print(f"管理员 '{username}' 已创建")
                else:
                    print("创建失败，用户名可能已存在")
            
            elif choice == "4":
                # 启用/禁用管理员
                username = input("请输入要操作的用户名: ").strip()
                admin = db.query(AdminUser).filter(AdminUser.username == username).first()
                if not admin:
                    print(f"用户 '{username}' 不存在")
                    continue
                
                admin.is_active = not admin.is_active
                db.commit()
                status = "启用" if admin.is_active else "禁用"
                print(f"用户 '{username}' 已{status}")
            
            elif choice == "5":
                # 删除管理员
                username = input("请输入要删除的用户名: ").strip()
                admin = db.query(AdminUser).filter(AdminUser.username == username).first()
                if not admin:
                    print(f"用户 '{username}' 不存在")
                    continue
                
                # 确认删除
                confirm = input(f"确定要删除用户 '{username}' 吗? (yes/no): ").strip().lower()
                if confirm == "yes":
                    db.delete(admin)
                    db.commit()
                    print(f"用户 '{username}' 已删除")
                else:
                    print("取消删除")
            
            else:
                print("无效的选项")
    
    finally:
        db.close()


if __name__ == "__main__":
    main()
