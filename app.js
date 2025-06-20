const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const { body, validationResult } = require('express-validator');

// Initialize express app
const app = express();
const port = 3000;

// Set up MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',  // Replace with your MySQL username
    password: 'pass@3264',  // Replace with your MySQL password
    database: 'bld_donor',
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
app.get('/', (req, res) => {
    if (req.session.loggedIn) {
        res.render('home', { username: req.session.username });
    } else {
        res.redirect('/login');
    }
});

//home page

app.get('/home', (req, res) => {
    res.render('home');
});


// About Page Route

app.get('/about', (req, res) => {
    if (req.session.loggedIn) {
        res.render('about');  // Render the about.ejs page
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});


// Profile Page Route
app.get('/profile', (req, res) => {
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
                res.render('profile', { user });  // Render the profile page with user data
            } else {
                res.status(404).send('User not found.');
            }
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});

// Update Profile Route

app.post('/updateProfile', (req, res) => {
    if (req.session.loggedIn) {
        const { email, phone, blood_group, weight } = req.body;
        const username = req.session.username;

        // Update the user's profile in the database
        const query = 'UPDATE users SET email = ?, phone = ?, blood_group = ?, weight = ? WHERE username = ?';
        db.query(query, [email, phone, blood_group, weight, username], (err, results) => {
            if (err) {
                return res.status(500).send('Error updating profile data.');
            }

            // If update is successful, redirect to the profile page
            res.redirect('/profile');
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
});



//  // Donor page (age and weight validation)
// app.get('/donor', (req, res) => {
//     if (req.session.loggedIn) {
//         const query = 'SELECT * FROM users WHERE username = ?';
//         db.query(query, [req.session.username], (err, results) => {
//             if (err) {
//                 return res.status(500).send('Error fetching user data.');
//             }
//             const user = results[0];
//             if (user.age >= 18 && user.weight >= 50) {
//                 res.render('donor', { user });
//             } else {
//                 res.send('You are not eligible to donate blood due to age or weight restrictions.');
//             }
//         });
//     } else {
//         res.redirect('/login');
//     }
// });

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
        const queryUser = 'SELECT id, blood_group, age, weight FROM users WHERE username = ?';
        db.query(queryUser, [username], (err, results) => {
            if (err) {
                return res.status(500).send('Error retrieving user data.');
            }

            if (results.length > 0) {
                const user = results[0];

                // Check if the user has donated blood in the last 3 months
                const queryLastDonation = 'SELECT donation_date FROM donation WHERE user_id = ? ORDER BY donation_date DESC LIMIT 1';
                db.query(queryLastDonation, [user.id], (err, donationResults) => {
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
        const queryInsertDonation = 'INSERT INTO donation (user_id, blood_group, weight, age) VALUES (?, ?, ?, ?)';
        db.query(queryInsertDonation, [userId, bloodGroup, weight, age], (err, result) => {
            if (err) {
                return res.status(500).send('Error processing your donation.');
            }

            // Redirect to a success page after donation is processed
            res.redirect('/donation-success');
        });
    });
});




// // Receiver page (doctor appointment and blood group)
// app.get('/receiver', (req, res) => {
//     res.render('receiver');
// });

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

// Blood Request Route
app.post('/request-blood', (req, res) => {
    const { bloodGroup, doctor, appointmentDate } = req.body;

    if (req.session.loggedIn) {
        const username = req.session.username;
        
        // Query to store the blood request in the database
        const query = 'INSERT INTO blood_requests (username, blood_group, doctor_id, appointment_date) VALUES (?, ?, ?, ?)';
        db.query(query, [username, bloodGroup, doctor, appointmentDate], (err, result) => {
            if (err) {
                return res.status(500).send('Error processing your blood request.');
            }

            res.redirect('/receiver'); // Redirect back to receiver page after submission
        });
    } else {
        res.redirect('/login'); // Redirect to login if not logged in
    }
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

// Register page
app.get('/register', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// app.post('/register', [
//     body('email').isEmail().withMessage('Invalid email address'),
//     body('password').isLength({ min: 8 }).withMessage('Password should be at least 8 characters'),
//     // more validation rules here...
//  ], (req, res) => {
//      const errors = validationResult(req);
//      if (!errors.isEmpty()) {
//          return res.status(400).json({ errors: errors.array() });
//      }
//      // continue with registration...
//  });

// All Ready register Page Route
app.get('/all-regis', (req, res) => {
    if (req.session.loggedIn) {
        res.render('all-regis');  // Render the all-regis.ejs page
    } else {
        res.redirect('/login');  // Redirect to login if not logged in
    }
});

// Register page
app.get('/register', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Handle user registration
app.post('/register', [
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 8 }).withMessage('Password should be at least 8 characters'),
    // more validation rules here...
 ], (req, res) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
         return res.status(400).json({ errors: errors.array() });
     }
     // continue with registration...
    const { username, password, age, phone, email, blood_group, weight } = req.body;

    if (!username || !password || !age || !phone || !email || !weight) {
        return res.status(400).send('All fields are required.');
    }

    bcrypt.hash(password, 12, (err, hashedPassword) => {
        if (err) {
            return res.status(500).send('Error hashing password.');
        }

        const query = 'INSERT INTO users (username, password, age, phone, email, blood_group, weight) VALUES (?, ?, ?, ?, ?, ?, ?)';
        db.query(query, [username, hashedPassword, age, phone, email, blood_group, weight], (err, result) => {
            if (err) {
                return res.status(500).send('Error registering user.');
            }
            res.redirect('/login');
        });
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
