from logger import get_logger

logger = get_logger(__name__)

from logger import get_logger

logger = get_logger(__name__)

import requests
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.core import Base, JobEntry, User, UserProfile
from auth import get_password_hash

# Config
API_URL = "http://localhost:8002"
# Use localhost for DB connection from host script
DATABASE_URL = "postgresql://user:password@localhost:5432/jobdb"


def setup_db_connection():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    return Session()


def main():
    logger.info("--- Starting Verification ---")

    # 1. Login Admin
    logger.info("[1] Login Admin...")
    resp = requests.post(
        f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"}
    )
    if resp.status_code != 200:
        logger.error(f"FAILED to login admin: {resp.text}")
        return
    admin_token = resp.json()["access_token"]
    logger.info("    Admin logged in.")

    # 2. Create Test User
    logger.info("[2] Creating 'testuser'...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(
        f"{API_URL}/users",
        json={"username": "testuser", "password": "testpassword"},
        headers=headers,
    )

    if resp.status_code == 200:
        logger.info("    User created.")
        user_id = resp.json()["id"]
    elif resp.status_code == 400 and "already registered" in resp.text:
        logger.info("    User already exists (skipping creation).")
        # Need to get ID? login and /me
    else:
        logger.error(f"FAILED to create user: {resp.text}")
        return

    # 3. Login Test User
    logger.info("[3] Login 'testuser'...")
    resp = requests.post(
        f"{API_URL}/auth/login",
        data={"username": "testuser", "password": "testpassword"},
    )
    if resp.status_code != 200:
        logger.error(f"FAILED to login testuser: {resp.text}")
        return
    user_token = resp.json()["access_token"]
    logger.info("    Testuser logged in.")

    # 4. Get User ID if not known
    resp = requests.get(
        f"{API_URL}/me", headers={"Authorization": f"Bearer {user_token}"}
    )
    user_id = resp.json()["id"]

    # 5. Insert Job for Test User via DB (Bypassing scraper complexity)
    logger.info(f"[4] Inserting Job for User ID {user_id}...")
    db = setup_db_connection()
    try:
        job_id = "test-job-123"
        # Cleanup
        db.query(JobEntry).filter(JobEntry.id == job_id).delete()
        db.commit()

        job = JobEntry(
            id=job_id,
            title="Python Developer",
            company="Test Corp",
            description="Coding python",
            match_score=95.0,
            status="OPEN",
            user_id=user_id,
        )
        db.add(job)
        db.commit()
        logger.info("    Job inserted.")
    except Exception as e:
        logger.error(f"FAILED DB Operation: {e}")
        return
    finally:
        db.close()

    # 6. Verify Test User sees the job
    logger.info("[5] Verifying Test User sees job...")
    resp = requests.get(
        f"{API_URL}/jobs", headers={"Authorization": f"Bearer {user_token}"}
    )
    jobs = resp.json()
    found = any(j["id"] == job_id for j in jobs)
    if found:
        logger.info(f"    SUCCESS: User sees {len(jobs)} jobs (including test job).")
    else:
        logger.error("    FAILED: User does not see the job.")
        logger.info(jobs)

    # 7. Verify Admin does NOT see the job
    logger.info("[6] Verifying Admin does NOT see the job...")
    resp = requests.get(
        f"{API_URL}/jobs", headers={"Authorization": f"Bearer {admin_token}"}
    )
    jobs = resp.json()
    found = any(j["id"] == job_id for j in jobs)
    if not found:
        logger.info("    SUCCESS: Admin does not see the job.")
    else:
        logger.error("    FAILED: Admin sees the user's job!")

    logger.info("--- Verification Complete ---")


if __name__ == "__main__":
    main()
