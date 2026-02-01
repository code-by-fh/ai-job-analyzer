# Crawl Scheduler Documentation

The Crawl Scheduler is responsible for periodically checking if any job platforms are due for a new crawl/search process. It ensures that the job database stays updated automatically without manual intervention.

## ⚙️ Architecture

The scheduler is built using **Celery Beat**, which acts as a periodic task scheduler within the Celery worker ecosystem.

1.  **Schedule Definition**: Defined in `ai-service/celery_config.py`.
2.  **Task Execution**: The worker process (`ai-service/worker.py`) executes the task.
3.  **Crawler Trigger**: The task communicates with the **Scraper Service** via HTTP to initiate crawls.

### Configuration (`celery_config.py`)

The schedule is currently set to run every **5 minutes**:

```python
celery_app.conf.beat_schedule = {
    'check-crawls-every-5-min': {
        'task': 'ai.check_platforms_for_crawl',
        'schedule': 300.0, # 5 minutes
    },
}
```

## 🧠 Logic Flow

The task `ai.check_platforms_for_crawl` follows this logic:

1.  **Fetch Platforms**: Queries the `job_platforms` database table for all platforms where `is_active = True`.
2.  **Check Interval**: For each platform, it compares the `last_crawl_at` timestamp with the current time.
    *   If `last_crawl_at` is `NULL` (never crawled) -> **Trigger**.
    *   If `(Now - last_crawl_at) > crawl_interval_minutes` -> **Trigger**.
3.  **Trigger Crawl**: Sends a POST request to the Scraper Service (`/search` endpoint).
4.  **Update State**: If the request is successful, updates `last_crawl_at` to the current time.

## 🧪 How to Test & Verify

### 1. Verify Configuration
Ensure that the task name in `celery_config.py` matches the task name defined in `worker.py`.
*   **Config**: `task: 'ai.check_platforms_for_crawl'`
*   **Worker**: `@celery_app.task(name="ai.check_platforms_for_crawl")`

### 2. Manual Trigger (Python Shell)
You can manually trigger the scheduling logic without waiting for the 5-minute interval by running the task function directly from the AI Service shell.

**Steps:**
1.  Enter the AI Service container:
    ```bash
    docker exec -it ai-service bash
    ```
    *(Or active environment if running locally)*

2.  Run the Python shell:
    ```bash
    python
    ```

3.  Execute the task:
    ```python
    from worker import check_platforms_for_crawl
    
    # Run synchronously
    check_platforms_for_crawl()
    ```

4.  **Check Output**:
    *   Look for logs: `🚀 Platform ... is due for crawl. Triggering...` or `No platforms due for crawl.`
    *   Check Database: The `last_crawl_at` column in `job_platforms` should be updated.

### 3. Check Logs
If the system is running via Docker Compose, you can check the logs to see the periodic execution:

```bash
docker logs -f ai-service
```

Look for:
*   `Checking platforms for scheduled crawls...`
*   `Triggered X periodic crawls.`

### 4. Celery Beat Status
Ensure the Celery Beat process is running. In a standard Celery setup, the beat service must be started, often alongside the worker or as a separate process.

Command to start beat (if not automated in Dockerfile):
```bash
celery -A celery_config beat --loglevel=info
```
