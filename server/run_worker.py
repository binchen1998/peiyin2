"""
独立运行的 Worker 脚本
用于处理后台任务（推荐片段生成、人声去除等）

使用方式：
    python run_worker.py

注意：Worker 只需要运行一个实例，不要启动多个
"""

import asyncio
import logging

from database import init_db
from worker import recommendation_worker, vocal_removal_worker

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """主函数：启动所有 Worker"""
    logger.info("=" * 50)
    logger.info("Worker 服务启动中...")
    logger.info("=" * 50)
    
    # 初始化数据库
    init_db()
    logger.info("数据库初始化完成")
    
    # 创建所有 Worker 任务
    tasks = [
        asyncio.create_task(recommendation_worker()),
        asyncio.create_task(vocal_removal_worker()),
    ]
    
    logger.info(f"已启动 {len(tasks)} 个 Worker 任务")
    logger.info("  - 推荐片段生成 Worker")
    logger.info("  - 人声去除 Worker")
    logger.info("=" * 50)
    
    try:
        # 等待所有任务完成（正常情况下会一直运行）
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        logger.info("Worker 收到取消信号")
    except KeyboardInterrupt:
        logger.info("Worker 收到键盘中断")
    finally:
        # 取消所有任务
        for task in tasks:
            task.cancel()
        logger.info("所有 Worker 已停止")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker 服务已退出")
