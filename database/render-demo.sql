-- Demo-only schema and fabricated example.edu data for hosted deployments.
-- Import into an empty hosted database. Never import local production student records.
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roll_number VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(25), department VARCHAR(100) NOT NULL,
  year TINYINT UNSIGNED NOT NULL,
  gender ENUM('Female','Male','Other','Prefer not to say') DEFAULT NULL,
  date_of_birth DATE DEFAULT NULL, address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS faculty (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(25), department VARCHAR(100) NOT NULL,
  specialization VARCHAR(120)
);
CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(120) NOT NULL,
  department VARCHAR(100) NOT NULL,
  year TINYINT UNSIGNED DEFAULT NULL,
  credits TINYINT UNSIGNED DEFAULT 3,
  faculty_id INT DEFAULT NULL,
  CONSTRAINT fk_course_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment (student_id, course_id),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('Present','Absent') NOT NULL,
  UNIQUE KEY uq_attendance (student_id, course_id, attendance_date),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  internal_marks DECIMAL(5,2) NOT NULL,
  external_marks DECIMAL(5,2) NOT NULL,
  total_marks DECIMAL(5,2) NOT NULL,
  grade VARCHAR(2) NOT NULL,
  UNIQUE KEY uq_marks (student_id, course_id),
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

INSERT IGNORE INTO faculty(id,full_name,email,phone,department,specialization) VALUES
(1,'Dr. Asha Menon','asha.menon@example.edu','9876501001','Computer Science','Data Structures'),
(2,'Prof. Rohan Shah','rohan.shah@example.edu','9876501002','Computer Science','Database Systems');
INSERT IGNORE INTO students(id,roll_number,full_name,email,phone,department,year,gender,date_of_birth,address) VALUES
(1,'CS2024001','Ananya Rao','ananya.rao@example.edu','9876502001','Computer Science',2,'Female','2005-04-12','Pune, Maharashtra'),
(2,'CS2024002','Kabir Joshi','kabir.joshi@example.edu','9876502002','Computer Science',2,'Male','2004-11-03','Mumbai, Maharashtra'),
(3,'IT2024001','Mira Patel','mira.patel@example.edu','9876502003','Information Technology',2,'Female','2005-01-28','Nashik, Maharashtra');
INSERT IGNORE INTO courses(id,course_code,course_name,department,year,credits,faculty_id) VALUES
(1,'CS201','Data Structures','Computer Science',2,4,1),
(2,'CS202','Database Management Systems','Computer Science',2,4,2);
INSERT IGNORE INTO enrollments(student_id,course_id) VALUES (1,1),(1,2),(2,1),(2,2),(3,2);
INSERT IGNORE INTO attendance(student_id,course_id,attendance_date,status) VALUES
(1,1,'2026-11-02','Present'),(1,1,'2026-11-03','Present'),(2,1,'2026-11-02','Absent'),(2,1,'2026-11-03','Present'),(1,2,'2026-11-03','Present');
INSERT IGNORE INTO marks(student_id,course_id,internal_marks,external_marks,total_marks,grade) VALUES
(1,1,34,52,86,'A'),(2,1,29,45,74,'B'),(1,2,36,55,91,'A+');
