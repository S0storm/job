-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "kimi_api_key_enc" TEXT,
    "model" TEXT NOT NULL DEFAULT 'kimi-k2.6',
    "notify_interview" BOOLEAN NOT NULL DEFAULT true,
    "notify_no_feedback" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_settings" ("created_at", "id", "kimi_api_key_enc", "model", "notify_interview", "notify_no_feedback", "updated_at", "user_id") SELECT "created_at", "id", "kimi_api_key_enc", "model", "notify_interview", "notify_no_feedback", "updated_at", "user_id" FROM "user_settings";
DROP TABLE "user_settings";
ALTER TABLE "new_user_settings" RENAME TO "user_settings";
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
