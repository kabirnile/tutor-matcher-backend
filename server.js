const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 1. Debugging: Print credentials (don't show password) to prove they are loaded
console.log("------------------------------------------");
console.log("🚀 SERVER STARTING...");
console.log("Target Host:", process.env.DB_HOST);
console.log("Target User:", process.env.DB_USER);
console.log("Target DB:", process.env.DB_NAME);
console.log("------------------------------------------");

// 2. Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.post('/match-tutor', (req, res) => {
    console.log("📩 Request Received! Input:", req.body); // <--- Log 1

    const { subject, maxBudget } = req.body;

    const sql = `
        SELECT * FROM tutors 
        WHERE subject = ? 
        AND hourly_rate <= ? 
        AND is_available = 1
    `;

    console.log("🔎 Running SQL Query..."); // <--- Log 2

    db.query(sql, [subject, maxBudget], (err, candidates) => {
        if (err) {
            // CRITICAL: This prints the REAL error to Render Logs
            console.error("❌ DATABASE ERROR:", err); 
            return res.status(500).json({ error: "DB Error: " + err.message });
        }

        console.log(`✅ Found ${candidates.length} candidates.`); // <--- Log 3

        if (candidates.length === 0) {
            return res.json({ 
                success: false, 
                message: "No tutors found matching your budget/subject." 
            });
        }

        // SCORING LOGIC
        try {
            const scoredTutors = candidates.map(tutor => {
                let Q = tutor.rating * 20; 
                let F = (1 / (tutor.active_students + 1)) * 100;
                let baseScore = (Q * 0.6) + (F * 0.4);
                let bonus = 0;

                // Cold start logic check
                if (tutor.join_date) {
                    const oneDay = 24 * 60 * 60 * 1000;
                    const joinDate = new Date(tutor.join_date);
                    const today = new Date();
                    const daysSinceJoined = Math.round(Math.abs((today - joinDate) / oneDay));
                    if (daysSinceJoined < 30 && tutor.total_classes < 5) {
                        bonus = 10;
                    }
                }
                
                return { ...tutor, finalScore: baseScore + bonus };
            });

            scoredTutors.sort((a, b) => b.finalScore - a.finalScore);
            console.log("🏆 Winner selected:", scoredTutors[0].name);

            res.json({ success: true, assignedTutor: scoredTutors[0] });

        } catch (calcError) {
            console.error("❌ CALCULATION ERROR:", calcError);
            res.status(500).json({ error: "Calculation failed" });
        }
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Server is live on port ${PORT}`);
});
