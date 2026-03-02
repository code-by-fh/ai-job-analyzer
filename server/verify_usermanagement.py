import requests
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, JobEntry, User, UserProfile
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
    print("--- Starting Verification ---")
    
    # 1. Login Admin
    print("[1] Login Admin...")
    resp = requests.post(f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"})
    if resp.status_code != 200:
        print(f"FAILED to login admin: {resp.text}")
        return
    admin_token = resp.json()["access_token"]
    print("    Admin logged in.")

    # 2. Create Test User
    print("[2] Creating 'testuser'...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{API_URL}/users", json={"username": "testuser", "password": "testpassword"}, headers=headers)
    
    if resp.status_code == 200:
        print("    User created.")
        user_id = resp.json()["id"]
    elif resp.status_code == 400 and "already registered" in resp.text:
         print("    User already exists (skipping creation).")
         # Need to get ID? login and /me
    else:
        print(f"FAILED to create user: {resp.text}")
        return

    # 3. Login Test User
    print("[3] Login 'testuser'...")
    resp = requests.post(f"{API_URL}/auth/login", data={"username": "testuser", "password": "testpassword"})
    if resp.status_code != 200:
        print(f"FAILED to login testuser: {resp.text}")
        return
    user_token = resp.json()["access_token"]
    print("    Testuser logged in.")

    # 4. Get User ID if not known
    resp = requests.get(f"{API_URL}/me", headers={"Authorization": f"Bearer {user_token}"})
    user_id = resp.json()["id"]
    
    # 5. Insert Job for Test User via DB (Bypassing scraper complexity)
    print(f"[4] Inserting Job for User ID {user_id}...")
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
            user_id=user_id
        )
        db.add(job)
        db.commit()
        print("    Job inserted.")
    except Exception as e:
        print(f"FAILED DB Operation: {e}")
        return
    finally:
        db.close()

    # 6. Verify Test User sees the job
    print("[5] Verifying Test User sees job...")
    resp = requests.get(f"{API_URL}/jobs", headers={"Authorization": f"Bearer {user_token}"})
    jobs = resp.json()
    found = any(j['id'] == job_id for j in jobs)
    if found:
        print(f"    SUCCESS: User sees {len(jobs)} jobs (including test job).")
    else:
        print("    FAILED: User does not see the job.")
        print(jobs)

    # 7. Verify Admin does NOT see the job
    print("[6] Verifying Admin does NOT see the job...")
    resp = requests.get(f"{API_URL}/jobs", headers={"Authorization": f"Bearer {admin_token}"})
    jobs = resp.json()
    found = any(j['id'] == job_id for j in jobs)
    if not found:
        print("    SUCCESS: Admin does not see the job.")
    else:
        print("    FAILED: Admin sees the user's job!")

    print("--- Verification Complete ---")

if __name__ == "__main__":
    main()
