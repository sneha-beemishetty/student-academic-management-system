# Student Academic Management System

A beginner friendly college mini project built with Node.js, Express, MySQL, HTML, CSS, JavaScript and Bootstrap 5. It includes admin login, student and faculty records, course assignments, attendance, marks, dashboard statistics and CSV reports.

## Requirements

- Node.js 18 or newer and npm
- MySQL Server 8 (or a compatible MySQL server)

## Setup on Windows

1. Open PowerShell in this project folder.
2. Create the database and sample data. For example, in MySQL Command Line Client:

   ```sql
   SOURCE C:/path/to/this/project/database/database.sql;
   ```

   Alternatively, in PowerShell run `mysql -u root -p < database/database.sql` from this folder. The `mysql` command must be on your PATH.

3. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` and enter your MySQL username and password. Set `SESSION_SECRET` to a long random value; you can generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep `.env` private; it is excluded from Git.
5. Install packages and start the server:

   ```powershell
   npm install
   npm start
   ```

6. Visit [http://localhost:3000](http://localhost:3000).

The optional development command `npm run dev` restarts the server when you change server files.

## First login

- Username: `admin`
- Password: `Admin@123`

The SQL setup stores a SHA-256 bootstrap hash for this initial account. On the first successful login, the server replaces it with a salted bcrypt password hash. Change the default password before using this beyond a local classroom demo.

## What you can do

- **Dashboard:** database backed totals, recent registrations and subject averages.
- **Students:** add, edit, delete and search by name, roll number or email.
- **Faculty:** maintain faculty records and assign them to courses.
- **Courses:** manage subjects and assign courses to students.
- **Attendance:** select a course and date, load enrolled students, and save present or absent status. Saving the same date again updates the existing attendance.
- **Marks:** enter or update internal marks (out of 40) and external marks (out of 60). The application calculates the total and grade.
- **Reports:** view student, attendance, subject marks and performance reports, and export the selected report as CSV.

## Database

`database/database.sql` creates `student_academic_db`, all seven tables, constraints and starter records. Attendance is unique per student, course and date. Enrollments and marks also prevent duplicate student/course pairs. Foreign keys keep related records consistent; deleting a student cascades their attendance, marks and enrollments.

## Project layout

```text
config/db.js          MySQL connection pool
middleware/auth.js    API session guard
server.js             Express application and API routes
views/                Login and module pages
public/css/            Responsive blue and white theme
public/js/             Login and shared module interactions
database/database.sql Database schema and sample records
```

## Troubleshooting

- **Database connection error:** confirm MySQL is running and `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` in `.env` match your installation.
- **Access denied:** check the MySQL username/password; these are separate from the web admin login.
- **Port in use:** set another available port in `.env` and open that port in the browser.
- **Duplicate value:** roll number, email, course code, enrollment and marks pairs must be unique.

All data operations use parameterized MySQL statements. Admin APIs require an authenticated Express session. Bootstrap and fonts load from public CDNs, so their styling requires an internet connection.
# Deploying a public demo to Render

This project uses MySQL. Render's Blueprint can configure the Node web service,
but the MySQL server is a separate paid private service with a persistent disk.
The included `database/render-demo.sql` contains only the app schema and
fabricated `example.edu` sample records. It does not contain an admin password
or any data from your local MySQL database.

## Prepare a hosted demo

1. Create a **private** GitHub repository and upload the project files. Do not
   upload `.env`, `node_modules`, or student data exports. The generated project
   report is excluded by `.gitignore`.
2. In Render, create a private MySQL service following
   [Render's MySQL guide](https://render.com/docs/deploy-mysql). It requires a
   persistent disk. Use a new empty database and unique credentials.
3. Connect the private repository to Render and deploy its `render.yaml`
   Blueprint. When prompted for environment values, set `DB_HOST`, `DB_PORT`,
   `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to the private MySQL service's
   internal connection values. Set `ADMIN_USERNAME` and a unique
   `ADMIN_PASSWORD` of at least 16 characters. Render generates
   `SESSION_SECRET` for the Blueprint service. Leave the web service publicly
   reachable; the dashboard itself still requires login.
4. On first startup, the web service initializes an empty database
   from `database/render-demo.sql`, which contains only the demo schema and
   fabricated sample records. It then creates the configured admin account.
   Startup refuses to initialize any database that already contains tables,
   and refuses unexpected admin accounts; use a new empty hosted database.
5. Sign in using the admin credentials you set in Render. Do not import your
   local database into the public demo.

## Cost and operation

The web service can use Render's free plan, which may sleep after inactivity.
Render MySQL is paid and its persistent disk is billed separately; check the
current [Render MySQL pricing](https://render.com/hosting/mysql) before
creating it. You manage MySQL maintenance and backups. Keep the GitHub
repository private, and do not put database credentials in source files.
