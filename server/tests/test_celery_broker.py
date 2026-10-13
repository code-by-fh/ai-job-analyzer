"""Both Celery apps talk to one broker, also when CELERY_BROKER_URL is unset (a bare local run)."""

from core import celery_config, scraper_celery_config


def test_the_scraper_app_and_the_ai_worker_share_one_broker():
    assert scraper_celery_config.celery_app.conf.broker_url == celery_config.celery_app.conf.broker_url
