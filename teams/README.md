# Hồ sơ team

Mỗi thư mục là một bản phát hành riêng.

`team.json` — cấu hình không nhạy cảm, commit lên repo được.
`service-account.json` — khoá riêng của team. **KHÔNG commit.** `.gitignore` đã chặn.

## Lấy sheetId ở đâu

Từ URL của Sheet: `docs.google.com/spreadsheets/d/`**`ID_NAM_O_DAY`**`/edit`

## Mỗi team một service account riêng

Bốn khoá tách biệt, mỗi khoá chỉ được chia sẻ vào đúng Sheet của nó.
Dùng chung một khoá là hỏng toàn bộ ranh giới: khoá nằm trong app trên máy họ
và trích ra được, nên khoá dùng chung sẽ mở được Sheet của mọi team.

## Build

Cục bộ:  `node build-team.js S1 --mac`
Trên CI: khoá lấy từ GitHub Secrets tên `SA_S1` ... `SA_S4`
