# Aula

Every lesson, understood, in any language, even if you missed it.

Aula turns a teacher's voice into live captions in each student's home language, lets lost students signal it silently, and turns every lesson into a recap no one can miss.

Work in progress for the CSC Back-to-School Hackathon. The full README comes with the submission.

## Run locally

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb aula
cp .env.example .env.local   # then fill in DATABASE_URL, AUTH_SECRET, AI_API_KEY
npm install
npm run db:migrate
npm run dev
```

`npm run check` runs lint, typecheck and unit tests.
