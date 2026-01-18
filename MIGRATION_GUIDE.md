# 🐘 Database Migrations with Alembic & Docker

This documentation describes how to perform database schema changes (new columns, tables, etc.) safely and traceably.

## 📋 The Standard Workflow (4 Steps)

### Step 1: Modify Python Code

Update your SQLAlchemy models in `ai-service/main.py`.

*Example:* You want to add a phone number to the user profile.

```python
# in main.py
class UserProfile(Base):
    # ... existing fields ...
    phone_number = Column(String, nullable=True) # <-- New

```

### Step 2: Generate Migration Script

Let Alembic detect the difference between your code and the actual database state to create a script.

Run this command in your terminal (in the project root):

```bash
docker-compose exec ai-api alembic revision --autogenerate -m "Add phone number to profile"

```

* `exec ai-api`: Runs the command inside the running container.
* `--autogenerate`: Compares `Base.metadata` with the live DB.
* `-m "..."`: A description of the change (crucial for history!).

✅ **Result:** You will find a new file in `ai-service/migrations/versions/`, e.g., `1a2b3c_add_phone_number_to_profile.py`.

### Step 3: Review the Script (IMPORTANT!)

Open the newly created file locally in your editor.
**Never trust `--autogenerate` blindly!**

* Check the `def upgrade():` function.
* Does it contain the correct operations? (e.g., `op.add_column(...)`)
* Sometimes Alembic fails to detect renames and suggests dropping the table (`op.drop_table`) and creating a new one instead. Correct this manually if necessary.

### Step 4: Apply Migration

Apply the changes to the database:

```bash
docker-compose exec ai-api alembic upgrade head

```

* `upgrade head`: Updates the DB to the very latest revision.

---

## ⏪ Rollback (Undo Changes)

Did you make a mistake or need to revert a change?

**Go back one step:**

```bash
docker-compose exec ai-api alembic downgrade -1

```

**Reset completely (Drop all tables):**

```bash
docker-compose exec ai-api alembic downgrade base

```

---

## 💡 Pro Tips for Alembic

### 1. Check Current State

If you are unsure which version your database is currently on:

```bash
docker-compose exec ai-api alembic current

```

### 2. Migrations without Code Changes (Data Migrations)

Sometimes you want to modify data instead of structure (e.g., setting all users to "active").
Create an empty revision without `--autogenerate`:

```bash
docker-compose exec ai-api alembic revision -m "set default user status"

```

Then open the file and write Python/SQL logic inside `upgrade()`:

```python
def upgrade():
    op.execute("UPDATE user_settings SET status = 'active'")

```

### 3. Avoid Merge Conflicts

If working in a team and two people create a migration at the same time, you will have two "Heads". Alembic will complain.
Solution:

```bash
docker-compose exec ai-api alembic merge heads -m "merge conflict"

```

### 4. Issues with Enums and Special Types

`--autogenerate` often struggles to detect changes in `ENUM` types or specific PostgreSQL constraints. You usually have to add these changes manually to the migration script.

### 5. Docker Volume Reset (The "Nuke" Option)

If your local migrations and the database are completely out of sync and nothing works anymore (Development only!):

1. Delete Containers & Volumes: `docker-compose down -v`
2. Clean up the `versions` folder (delete `.py` files if you want to start fresh).
3. Restart: `docker-compose up -d --build`

---

## 🛠 Troubleshooting

**Error: `Target database is not up to date.**`

* **Cause:** Your code expects a newer DB version than what is currently running.
* **Solution:** Run `alembic upgrade head`.

**Error: `Table already exists` during `upgrade`.**

* **Cause:** You created the table manually (or via the old `init_db`), but Alembic thinks it needs to create it.
* **Solution:** Drop the tables in the DB manually or use `alembic stamp head` (this tells Alembic: "Pretend the DB is already up to date").

**Error: `ImportError: cannot import name 'JobEntry'**`

* **Cause:** Alembic cannot find your models in `main.py`.
* **Solution:** Check `migrations/env.py`. Does `sys.path` point to the correct directory? Are the models imported correctly? (We set this up correctly in the previous steps).