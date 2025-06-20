const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const twilio = require('twilio');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

// // Twilio Configuration
// const accountSid = 'your_twilio_account_sid';
// const authToken = 'your_twilio_auth_token';
// const twilioPhone = 'your_twilio_phone_number';
// const client = new twilio(accountSid, authToken);

// // Store OTPs temporarily (in production, use a database or Redis)
// const otpStorage = {};

// Initialize express app
const app = express();
const port = 3000;

// Set up MySQL connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

// Connect to MySQL
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ', err);
        return;
    }
    console.log('Connected to MySQL database.');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Session middleware
app.use(session({
    secret: 'secretkey',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // ensures it's only sent over HTTPS in production
        httpOnly: true, // Prevents JavaScript access to session cookie
        sameSite: 'strict', // Protects against CSRF
    }
}));

// Routes
// Home page (only accessible when logged in)

app.get("/", async (req, res) => {
    if (!req.session.loggedIn) {
        return res.redirect("/login");
    }

    try {
        const [donors] = await db.promise().query("SELECT COUNT(*) AS total FROM donation_history");
        const [requests] = await db.promise().query("SELECT COUNT(*) AS total FROM blood_requests");

        res.render("home", {
            username: req.session.username,
            totalDonors: donors[0].total,
            totalRequests: requests[0].total
        });

    } catch (error) {
        console.error("Database error:", error);
        res.render("home", {
            username: req.session.username,
            totalDonors: 0, // Fallback value
            totalRequests: 0 // Fallback value
        });
    }
});


//home page

// app.get('/home', (req, res) => {
//     res.render('home');
// });


// About Page Route

app.get('/about', (req, res) => {
    if (req.session.loggedIn) {
        res.render('about');  // Render the about.ejs page
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});


// Configure Multer Storage
const storage = multer.diskStorage({
    destination: "./public/uploads/",
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|gif/;
        const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = fileTypes.test(file.mimetype);

        if (extName && mimeType) {
            return cb(null, true);
        } else {
            cb('Error: Images Only!');
        }
    }
});

// Profile Route
app.get('/profile', (req, res) => {
    const userName = req.session.username; // Ensure session userName is set
    // const userId = req.session.user_id; // Fix: Use user_id directly

    // if (!userName || !userId) {
    //     return res.redirect('/login'); // Redirect if user not logged in
    // }
    if (!userName) {
        return res.redirect('/login'); // Redirect if user not logged in
    }

    // Fetch user details from 'users' table
    db.query(
        'SELECT username,gender, age, phone, weight, email,profile_image,last_donation FROM users WHERE username = ?',
        [userName],
        (err, userResults) => {
            if (err) {
                console.error("MySQL Error:", err);
                return res.status(500).send('Database Error');
            }

            const user = userResults.length > 0 ? userResults[0] : {};

            // Fetch donation details from 'donation' table
            // db.query(
            //     'SELECT donation_date FROM donation_history WHERE user_id = ?',
            //     [userId],
            //     (err, donationResults) => {
            //         if (err) {
            //             console.error("MySQL Error:", err);
            //             return res.status(500).send('Database Error');
            //         }

            //         const user1 = donationResults.length > 0 ? donationResults[0] : {};

                    // Combine both user and donation details in a single render
                    res.render('profile', { user });
                }
            );
        }
    );
// });

// Update Profile Route (GET)
app.get('/update-profile', (req, res) => {
    const userId = req.session.username;

    if (!userId) {
        return res.redirect('/login');
    }

    db.query(
        'SELECT username, phone, email, weight, COALESCE(profile_image, "/uploads/default.png") AS profile_image FROM users WHERE username = ?',
        [userId],
        (err, results) => {
            if (err) {
                console.error("MySQL Error:", err);
                return res.status(500).send('Database Error');
            }

            res.render('update-profile', { user: results.length > 0 ? results[0] : {} });
        }
    );
});




// Profile Image and Info Update (POST)
app.post('/update-profile', upload.single('profile_pic'), (req, res) => {
    let userId = req.session.username;

    if (!userId) {
        return res.status(401).send('Unauthorized');
    }

    const { username, phone, email, weight } = req.body;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;

    // Fetch the existing profile image if no new file is uploaded
    db.query('SELECT profile_image FROM users WHERE username = ?', [userId], (err, results) => {
        if (err) {
            console.error("MySQL Error:", err);
            return res.status(500).send('Database Error');
        }

        const existingImage = results.length > 0 ? results[0].profile_image : '/uploads/default.png';
        const finalImagePath = imagePath || existingImage; // Keep old image if no new one

        let query = 'UPDATE users SET username = ?, phone = ?, email = ?, weight = ?, profile_image = ? WHERE username = ?';
        let values = [username, phone, email, weight, finalImagePath, userId];

        db.query(query, values, (err, result) => {
            if (err) {
                console.error("MySQL Error:", err);
                return res.status(500).send('Database Error');
            }
            res.redirect('/profile');
        });
    });
});

// Donor Page Route
app.get('/donor', (req, res) => {
    if (req.session.loggedIn) {
        const username = req.session.username;

        // Query the database to get the user's profile information
        const query = 'SELECT * FROM users WHERE username = ?';
        db.query(query, [username], (err, results) => {
            if (err) {
                return res.status(500).send('Error fetching profile data.');
            }

            if (results.length > 0) {
                const user = results[0];
                res.render('donor', { user });  // Render the donor page with user data
            } else {
                res.status(404).send('User not found.');
            }
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});

// Blood Donation Page Route
app.get('/blood-donate', (req, res) => {
    if (req.session.loggedIn) {
        const username = req.session.username;

        // First, get user details
        const queryUser = 'SELECT id, username, blood_group, age, weight FROM users WHERE username = ?';
        db.query(queryUser, [username], (err, results) => {
            if (err) {
                return res.status(500).send('Error retrieving user data.');
            }

            if (results.length > 0) {
                const user = results[0];

                // Check if the user has donated blood in the last 3 months
                const queryLastDonation = 'SELECT donation_date FROM donation_history WHERE user_id = ? ORDER BY donation_date DESC LIMIT 1';
                db.query(queryLastDonation, [user.user_id], (err, donationResults) => {
                    if (err) {
                        return res.status(500).send('Error retrieving donation data.');
                    }

                    const canDonate = donationResults.length === 0 ||
                        (new Date() - new Date(donationResults[0].donation_date)) > 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

                    if (canDonate) {
                        // Render the blood-donate page with user details and eligibility
                        res.render('blood-donate', { user, canDonate });
                    } else {
                        res.redirect('/blood-lim');
                    }
                });
            } else {
                res.status(404).send('User not found.');
            }
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});

// Donation Success Page Route
app.get('/donation-success', (req, res) => {
    if (req.session.loggedIn) {
        res.render('donation-success');  // Render the donation-success.ejs page
    } else {
        res.redirect('/login');  // Redirect to login if not logged in
    }
});

// Donation limit Page Route
app.get('/blood-lim', (req, res) => {
    if (req.session.loggedIn) {
        res.render('blood-lim');  // Render the blood-lim.ejs page
    } else {
        res.redirect('/login');  // Redirect to login if not logged in
    }
});

// Handle Blood Donation Submission
app.post('/donation', (req, res) => {
    const { bloodGroup, weight, age } = req.body;

    if (!bloodGroup || !weight || !age) {
        return res.status(400).send('All fields are required!');
    }

    if (age < 18 || age > 65) {
        return res.status(400).send('You must be between 18 and 65 years old to donate blood.');
    }

    if (weight < 50) {
        return res.status(400).send('You must weigh at least 50 kg to donate blood.');
    }

    const username = req.session.username;

    // Get the user's ID from the username
    const queryUser = 'SELECT id FROM users WHERE username = ?';
    db.query(queryUser, [username], (err, userResults) => {
        if (err) {
            return res.status(500).send('Error retrieving user data.');
        }

        if (userResults.length === 0) {
            return res.status(404).send('User not found.');
        }

        const userId = userResults[0].id;

        // Insert the donation into the donations table
        const queryInsertDonation = 'INSERT INTO donation_history ( blood_group, weight, age) VALUES (?, ?, ?)';
        db.query(queryInsertDonation, [ bloodGroup, weight, age], (err, result) => {
            if (err) {
                return res.status(500).send('Error processing your donation.');
            }

            // Redirect to a success page after donation is processed
            res.redirect('/donation-success');
        });
    });
});

// Receiver Page Route
app.get('/receiver', (req, res) => {
    if (req.session.loggedIn) {
        const queryDoctors = 'SELECT * FROM doctors'; // Query to get available doctors
        db.query(queryDoctors, (err, doctors) => {
            if (err) {
                return res.status(500).send('Error fetching doctors.');
            }

            res.render('receiver', { doctors });  // Render the receiver page with doctors data
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});

app.get('/blood-requests', (req, res) => {
    const query = `
        SELECT br.id, u.username, u.blood_group, d.name AS doctor_name, br.appointment_date, br.request_date
        FROM blood_requests br
        JOIN users u ON br.user_id = u.id
        JOIN doctors d ON br.doctor_id = d.id
        ORDER BY br.request_date DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error fetching blood requests.');
        }
        res.render('blood_requests', { requests: results });
    });
});


// Blood Request Route
app.post('/request-blood', (req, res) => {
    const { doctor_id, appointment_date } = req.body;

    if (!req.session.loggedIn) {
        return res.redirect('/login'); // Redirect to login if not authenticated
    }

    const user_id = req.session.user_id; // Retrieve user ID from session

    // Insert blood request into database
    const query = `
        INSERT INTO blood_requests (user_id, doctor_id, appointment_date)
        VALUES (?, ?, ?)
    `;
    db.query(query, [user_id, doctor_id, appointment_date], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error processing blood request.');
        }
        res.redirect('/receiver'); // Redirect after successful request
    });
});



// Contact Page Route
app.get('/contact', (req, res) => {
    if (req.session.loggedIn) {
        const username = req.session.username;

        // Query the users table to get the user information (name, email, etc.)
        const query = 'SELECT username, email FROM users WHERE username = ?';
        db.query(query, [username], (err, results) => {
            if (err) {
                return res.status(500).send('Error retrieving user data.');
            }

            if (results.length > 0) {
                const user = results[0];
                // Render the contact page with pre-filled form data
                res.render('contact', { user });
            } else {
                res.status(404).send('User not found.');
            }
        });
    } else {
        res.render('contact'); // If the user is not logged in, just render the form without pre-filling
    }
});

// contact-susscess Page Route
app.get('/contact-suss', (req, res) => {
    if (req.session.loggedIn) {
        res.render('contact-suss');  // Render the contact-suss.ejs page
    } else {
        res.redirect('/login');  // Redirect to login if not logged in
    }
});


// Handle Contact Form Submission
app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;

    // Ensure the required fields are filled
    if (!name || !email || !message) {
        return res.status(400).send('All fields are required.');
    }

    // Get user ID from the session (if logged in)
    const userId = req.session.loggedIn ? req.session.userId : null;

    // Insert the contact message into the database
    const query = 'INSERT INTO contact_submission (user_id, name, email, message) VALUES (?, ?, ?, ?)';
    db.query(query, [userId, name, email, message], (err, result) => {
        if (err) {
            return res.status(500).send('Error submitting your message.');
        }
        res.redirect('/contact-suss');
    });
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// All Ready register Page Route
app.get('/all-regis', (req, res) => {
    if (req.session.loggedIn) {
        res.render('all-regis');  // Render the all-regis.ejs page
    } else {
        res.redirect('/login');  // Redirect to login if not logged in
    }
});


// Register Page Route
app.get('/register', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

 app.post('/register', //[
    // body('email').trim().isEmail().withMessage('Invalid email address'),
    // body('password').isLength({ min: 8 }).withMessage('Password should be at least 8 characters'),
    // body('username').trim().notEmpty().withMessage('Username is required'),
    // body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be between 18 and 65'),
    // body('phone').matches(/^\d{10}$/).withMessage('Phone number must be 10 digits'),
    // body('blood_group').isIn(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']).withMessage('Invalid blood group'),
    // body('weight').isFloat({ min: 50 }).withMessage('Weight must be at least 50kg'),
    // body('gender').isIn(['male', 'female', 'others']).withMessage('Invalid gender selection')
//], 
 (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('register', { errors: errors.array(), formData: req.body });
    }

    const { username, password, age, phone, email, blood_group, weight, gender } = req.body;

    // ✅ Set Profile Image Based on Gender
    let profileImage = 'images/default.jpg'; // Default
    if (gender === 'male') {
        profileImage = 'images/menprofile.jpg';
    } else if (gender === 'female') {
        profileImage = 'images/femaleprofile.jpg';
    }

    // ✅ Check if Email Exists Before Inserting
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.length > 0) {
            return res.render('register', { errors: [{ param: 'email', msg: 'Email is already registered' }], formData: req.body });
        }

        // ✅ Hash Password & Insert Data
        bcrypt.hash(password, 12, (err, hashedPassword) => {
            if (err) return res.status(500).json({ error: 'Error hashing password.' });

            const query = 'INSERT INTO users (username, password, age, gender, phone, email, blood_group, weight, profile_image) VALUES (?, ?, ?, ?, ?, ?, ?, ? ,?)';
            db.query(query, [username, hashedPassword, age,gender, phone, email, blood_group, weight, profileImage], (err, result) => {
                if (err) return res.status(500).json({ error: 'Error registering user.' });
                res.redirect('/login');
            });
        });
    });
});


app.get('/check-email', (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.length > 0) {
            return res.status(409).json({ error: 'Email is already registered' });
        }
        res.status(200).json({ available: true });
    });
});



// Handle user login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Both fields are required.');
    }

    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.status(500).send('Error logging in.');
        }

        if (results.length === 0) {
            return res.status(400).send('Invalid username or password.');
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).send('Error logging in.');
            }

            if (!isMatch) {
                return res.status(400).send('Invalid username or password.');
            }

            req.session.loggedIn = true;
            req.session.username = user.username;
            res.redirect('/');

            // // Clear form fields when the page is loaded
            // window.onload = function() {
            //     document.getElementById("loginForm").reset(); // Assuming your form has id="loginForm"
            // };
        });
    });
});

//total donor and request 

// app.get("/", async (req, res) => {
//     try {
//         const [donors] = await db.promise().query("SELECT COUNT(*) AS total FROM donors");
//         const [requests] = await db.promise().query("SELECT COUNT(*) AS total FROM requests");

//         res.render("home", {
//             totalDonors: donors[0].total, 
//             totalRequests: requests[0].total
//         });

//     } catch (error) {
//         console.error("Database error:", error);
//         res.render("home", {
//             totalDonors: 0, // Fallback value
//             totalRequests: 0 // Fallback value
//         });
//     }
// });



// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error logging out.');
        }
        res.redirect('/login');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
