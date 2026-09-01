"""``python manage.py seed_items`` -- load ``seed_data.json`` into MongoDB.

Handy for trying the app, and for seeing the reminder engine do something
without waiting a month.  Expiry dates in the seed file may be written as an
offset from today (``"+21"``, ``"-5"``) so the sample data is always in a
useful state relative to whenever you run it; a literal ``YYYY-MM-DD`` works
too.

Seeded items go through the same validation as the API, so a bad seed file
fails loudly instead of writing something the app cannot read back.
"""

from __future__ import annotations

import datetime as dt
import json

from django.core.management.base import BaseCommand, CommandError

from core import mongo
from core.dates import today_local
from core.errors import ApiError
from items import services


def resolve_date(value):
    """``"+21"`` / ``"-5"`` become dates relative to today; anything else passes through."""
    text = str(value).strip()
    if text and text[0] in "+-" and text[1:].isdigit():
        return (today_local() + dt.timedelta(days=int(text))).isoformat()
    return value


class Command(BaseCommand):
    help = "Load sample items from a JSON file into MongoDB."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default="seed_data.json",
            help="Path to the seed file (default: seed_data.json).",
        )
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete every existing item (and its reminder records) first.",
        )

    def handle(self, *args, **options):
        path = options["file"]
        try:
            with open(path, encoding="utf-8") as handle:
                payloads = json.load(handle)
        except OSError as exc:
            raise CommandError("Could not read %s: %s" % (path, exc))
        except json.JSONDecodeError as exc:
            raise CommandError("%s is not valid JSON: %s" % (path, exc))

        if not isinstance(payloads, list):
            raise CommandError("%s must contain a list of items." % path)

        mongo.ensure_indexes()

        if options["flush"]:
            removed = mongo.items_collection().delete_many({}).deleted_count
            mongo.reminders_collection().delete_many({})
            self.stdout.write("Removed %d existing item(s)." % removed)

        created = 0
        skipped = 0

        for payload in payloads:
            payload = dict(payload)
            payload["expiries"] = [
                {**entry, "expires_on": resolve_date(entry.get("expires_on"))}
                for entry in payload.get("expiries") or []
            ]

            try:
                item = services.create_item(payload)
            except ApiError as exc:
                # A duplicate just means the command has been run before.
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        "Skipped %s: %s" % (payload.get("name"), exc.message)
                    )
                )
                continue

            created += 1
            self.stdout.write("Added %s (%s)" % (item["name"], item["category"]))

        self.stdout.write(
            self.style.SUCCESS("Done: %d added, %d skipped." % (created, skipped))
        )
