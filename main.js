const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Get all students
app.get('/api/students', (req, res) => {
    const filePath = path.join(dataDir, 'students.json');
    
    if (fs.existsSync(filePath)) {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading students:', err);
                return res.status(500).json({ error: 'Error reading students data' });
            }
            res.json(JSON.parse(data));
        });
    } else {
        res.json([]); 
    }
});

// Save students
app.post('/api/students', (req, res) => {
    const students = req.body;
    const filePath = path.join(dataDir, 'students.json');
    
    if (!Array.isArray(students)) {
        return res.status(400).json({ error: 'Students data should be an array' });
    }
    
    fs.writeFile(filePath, JSON.stringify(students, null, 2), (err) => {
        if (err) {
            console.error('Error saving students:', err);
            return res.status(500).json({ error: 'Error saving students data' });
        }
        res.json({ success: true, message: 'Students saved successfully', count: students.length });
    });
});

// Save attendance
app.post('/api/attendance', (req, res) => {
    const attendanceData = req.body;
    const filePath = path.join(dataDir, `attendance-${attendanceData.date}.json`);
    
    if (!attendanceData.date || !attendanceData.records) {
        return res.status(400).json({ error: 'Date and records are required' });
    }
    
    fs.writeFile(filePath, JSON.stringify(attendanceData, null, 2), (err) => {
        if (err) {
            console.error('Error saving attendance:', err);
            return res.status(500).json({ error: 'Error saving attendance data' });
        }
        res.json({ success: true, message: 'Attendance saved successfully', date: attendanceData.date });
    });
});

// NEW: Get all attendance dates (for filter dropdown)
app.get('/api/attendance/dates', (req, res) => {
    fs.readdir(dataDir, (err, files) => {
        if (err) {
            console.error('Error reading data directory:', err);
            return res.status(500).json({ error: 'Error reading attendance data' });
        }
        
        const attendanceFiles = files.filter(file => file.startsWith('attendance-') && file.endsWith('.json'));
        const dates = attendanceFiles.map(file => file.replace('attendance-', '').replace('.json', ''));
        
        res.json(dates.sort().reverse()); // Return dates sorted from newest to oldest
    });
});

// NEW: Get attendance for a specific date
app.get('/api/attendance/:date', (req, res) => {
    const date = req.params.date;
    const filePath = path.join(dataDir, `attendance-${date}.json`);
    
    if (fs.existsSync(filePath)) {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading attendance:', err);
                return res.status(500).json({ error: 'Error reading attendance data' });
            }
            res.json(JSON.parse(data));
        });
    } else {
        res.status(404).json({ error: 'Attendance record not found for this date' });
    }
});

// NEW: Get all attendance records with summary
app.get('/api/attendance', (req, res) => {
    fs.readdir(dataDir, (err, files) => {
        if (err) {
            console.error('Error reading data directory:', err);
            return res.status(500).json({ error: 'Error reading attendance data' });
        }
        
        const attendanceFiles = files.filter(file => file.startsWith('attendance-') && file.endsWith('.json'));
        const attendanceRecords = [];
        
        // If no attendance files found
        if (attendanceFiles.length === 0) {
            return res.json([]);
        }
        
        // Read each attendance file and create a summary
        let filesProcessed = 0;
        attendanceFiles.forEach(file => {
            const filePath = path.join(dataDir, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading attendance file:', err);
                } else {
                    try {
                        const attendanceData = JSON.parse(data);
                        const presentCount = attendanceData.records.filter(r => r.status === 'Present').length;
                        const absentCount = attendanceData.records.filter(r => r.status === 'Absent').length;
                        
                        attendanceRecords.push({
                            date: attendanceData.date,
                            totalStudents: attendanceData.records.length,
                            present: presentCount,
                            absent: absentCount,
                            attendanceRate: Math.round((presentCount / attendanceData.records.length) * 100)
                        });
                    } catch (parseError) {
                        console.error('Error parsing attendance file:', parseError);
                    }
                }
                
                filesProcessed++;
                if (filesProcessed === attendanceFiles.length) {
                    // Sort by date (newest first)
                    attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
                    res.json(attendanceRecords);
                }
            });
        });
    });
});

// NEW: Search attendance records by student name
app.get('/api/attendance/search/:studentName', (req, res) => {
    const studentName = req.params.studentName.toLowerCase();
    
    fs.readdir(dataDir, (err, files) => {
        if (err) {
            console.error('Error reading data directory:', err);
            return res.status(500).json({ error: 'Error reading attendance data' });
        }
        
        const attendanceFiles = files.filter(file => file.startsWith('attendance-') && file.endsWith('.json'));
        const studentRecords = [];
        
        // If no attendance files found
        if (attendanceFiles.length === 0) {
            return res.json([]);
        }
        
        // Search through each attendance file
        let filesProcessed = 0;
        attendanceFiles.forEach(file => {
            const filePath = path.join(dataDir, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading attendance file:', err);
                } else {
                    try {
                        const attendanceData = JSON.parse(data);
                        const studentRecord = attendanceData.records.find(r => 
                            r.name.toLowerCase().includes(studentName)
                        );
                        
                        if (studentRecord) {
                            studentRecords.push({
                                date: attendanceData.date,
                                name: studentRecord.name,
                                status: studentRecord.status,
                                timestamp: studentRecord.timestamp
                            });
                        }
                    } catch (parseError) {
                        console.error('Error parsing attendance file:', parseError);
                    }
                }
                
                filesProcessed++;
                if (filesProcessed === attendanceFiles.length) {
                    // Sort by date (newest first)
                    studentRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
                    res.json(studentRecords);
                }
            });
        });
    });
});

// NEW: Get attendance statistics
app.get('/api/attendance/stats/overview', (req, res) => {
    fs.readdir(dataDir, (err, files) => {
        if (err) {
            console.error('Error reading data directory:', err);
            return res.status(500).json({ error: 'Error reading attendance data' });
        }
        
        const attendanceFiles = files.filter(file => file.startsWith('attendance-') && file.endsWith('.json'));
        
        // If no attendance files found
        if (attendanceFiles.length === 0) {
            return res.json({
                totalRecords: 0,
                averageAttendance: 0,
                totalClasses: 0
            });
        }
        
        // Calculate statistics
        let totalPresent = 0;
        let totalStudents = 0;
        
        let filesProcessed = 0;
        attendanceFiles.forEach(file => {
            const filePath = path.join(dataDir, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading attendance file:', err);
                } else {
                    try {
                        const attendanceData = JSON.parse(data);
                        const presentCount = attendanceData.records.filter(r => r.status === 'Present').length;
                        
                        totalPresent += presentCount;
                        totalStudents += attendanceData.records.length;
                    } catch (parseError) {
                        console.error('Error parsing attendance file:', parseError);
                    }
                }
                
                filesProcessed++;
                if (filesProcessed === attendanceFiles.length) {
                    const averageAttendance = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;
                    
                    res.json({
                        totalRecords: attendanceFiles.length,
                        averageAttendance: averageAttendance,
                        totalClasses: attendanceFiles.length
                    });
                }
            });
        });
    });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});