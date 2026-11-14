# Upload this copy to a NEW GitHub repository

1. Create a new repository on GitHub (for example, `AgriSetu-AI-New`). Do not select your existing repository.
2. Extract this project ZIP and open the `AgriSetu-AI-New-Project` folder.
3. Upload the contents of that folder directly to the new repository root. The root should contain `index.html`, `app.js`, `firebase-config.js`, `database.rules.json`, and the other project files.
4. Commit the files to the `main` branch.
5. Open **Settings → Pages** and choose **Deploy from a branch → main → /(root)**. Save.
6. Add `YOUR-GITHUB-USERNAME.github.io` to the **new** Firebase project's Authentication → Settings → Authorized domains.
7. Follow `NEW_PROJECT_SETUP_GUIDE.md` for Firebase setup, database rules, ESP32 setup, and testing.

Do not upload `ESP32_Firebase/AgriSetu_ESP32_Firebase/secrets.h`. Only the safe `secrets.example.h` belongs in GitHub.
