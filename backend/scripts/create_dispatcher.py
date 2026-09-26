"""Add or update a dispatcher account in the accounts JSON file.

Usage (from the repository root):
    python backend/scripts/create_dispatcher.py ivanov "Иванов Иван Иванович"
    python backend/scripts/create_dispatcher.py ivanov --remove

The password is read interactively and only its PBKDF2 hash is stored.
"""

import argparse
import getpass
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import hash_password  # noqa: E402
from app.config import Settings  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("login")
    parser.add_argument("full_name", nargs="?")
    parser.add_argument("--file", type=Path, help="accounts file (default: AUTH_USERS_FILE)")
    parser.add_argument("--remove", action="store_true", help="delete the account")
    args = parser.parse_args()

    path = args.file or Settings.from_env().auth_users_file
    accounts = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    login = args.login.strip().lower()
    accounts = [item for item in accounts if item["login"].strip().lower() != login]

    if args.remove:
        print(f"Учётная запись {login} удалена из {path}")
    else:
        if not args.full_name:
            parser.error("full_name is required when creating an account")
        password = getpass.getpass("Пароль: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"Пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов", file=sys.stderr)
            return 1
        if getpass.getpass("Повторите пароль: ") != password:
            print("Пароли не совпадают", file=sys.stderr)
            return 1
        accounts.append({"login": login, "full_name": args.full_name, "password_hash": hash_password(password)})
        print(f"Учётная запись {login} сохранена в {path}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(accounts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
