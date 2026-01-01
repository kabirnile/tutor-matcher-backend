const db = mysql.createPool({
    host: process.env.DB_HOST,      // This pulls the IP from Render
    user: process.env.DB_USER,      // This pulls the User from Render
    password: process.env.DB_PASS,  // This pulls the Password from Render
    database: process.env.DB_NAME,  // This pulls the DB Name from Render
    port: 3306
});

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 1. Database Connection
const db = mysql.createPool({
    host: 'localhost',
    user: 'u235679011_tutor',   // <--- REPLACE THIS
    password: 'Farman@1976', // <--- REPLACE THIS
    database: 'u235679011_tutor'    // <--- REPLACE THIS
});

// 2. The "Smart Match" Route
app.post('/match-tutor', (req, res) => {
    // We expect the student to send: subject, maxBudget
    const { subject, maxBudget } = req.body;

    // ---------------------------------------------------------
    // STEP A: HARD FILTERING (Elimination)
    // ---------------------------------------------------------
    // We filter by SQL first to remove impossible options.
    // 1. Must match Subject
    // 2. Cost must be <= Budget
    // 3. Must be Available (is_available = 1)
    const sql = `
        SELECT * FROM tutors 
        WHERE subject = ? 
        AND hourly_rate <= ? 
        AND is_available = 1
    `;

    db.query(sql, [subject, maxBudget], (err, candidates) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (candidates.length === 0) {
            return res.json({ 
                success: false, 
                message: "No tutors found matching your budget and subject." 
            });
        }

        // ---------------------------------------------------------
        // STEP B & C: SCORING & COLD START BOOST
        // ---------------------------------------------------------
        const scoredTutors = candidates.map(tutor => {
            
            // --- 1. Quality Score (Q) ---
            // We assume Rating is out of 5. We multiply by 20 to make it out of 100.
            // Example: 4.5 stars * 20 = 90 points.
            let Q = tutor.rating * 20; 

            // --- 2. Fairness Score (F) ---
            // Logic: 1 / (Active Students + 1)
            // If 0 students: 1/1 = 1.0
            // If 9 students: 1/10 = 0.1
            // We multiply by 100 so it matches the Q scale (0-100).
            let F = (1 / (tutor.active_students + 1)) * 100;

            // --- 3. Weighted Formula (60% Quality, 40% Fairness) ---
            let baseScore = (Q * 0.6) + (F * 0.4);

            // --- 4. Cold Start Boost (Step C) ---
            let bonus = 0;
            
            // Calculate how many days since they joined
            const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
            const joinDate = new Date(tutor.join_date);
            const today = new Date();
            const daysSinceJoined = Math.round(Math.abs((today - joinDate) / oneDay));

            // Rule: If joined < 30 days ago AND taught < 5 classes
            if (daysSinceJoined < 30 && tutor.total_classes < 5) {
                bonus = 10; // The "New Joinee Boost"
                console.log(`Boosting New Tutor: ${tutor.name}`);
            }

            return {
                ...tutor,
                finalScore: baseScore + bonus,
                debugInfo: { Q, F, baseScore, bonus } // Helpful for you to see why they won
            };
        });

        // ---------------------------------------------------------
        // FINAL STEP: SORT & PICK WINNER
        // ---------------------------------------------------------
        // Sort descending (Highest score first)
        scoredTutors.sort((a, b) => b.finalScore - a.finalScore);

        const winner = scoredTutors[0];

        // OPTIONAL: Immediately update database to say "One more student added!"
        // You can uncomment this later when you are ready.
        // db.query('UPDATE tutors SET active_students = active_students + 1 WHERE id = ?', [winner.id]);

        res.json({ 
            success: true, 
            assignedTutor: winner 
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Smart Matching Server running on port ${PORT}`);

});
