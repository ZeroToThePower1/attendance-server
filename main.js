const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// MongoDB connection
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://chaudharsami324_db_user:VC1rvhRJSSTqHqoE@cluster0.egub0q2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// MongoDB Schemas
const studentSchema = new mongoose.Schema({
  name: String,
  studentId: String,
  class: String
});

const attendanceSchema = new mongoose.Schema({
  date: String,
  records: [{
    name: String,
    status: String,
    timestamp: String
  }]
});

const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error('Error reading students:', err);
    res.status(500).json({ error: 'Error reading students data' });
  }
});

// Save students
app.post('/api/students', async (req, res) => {
  try {
    const students = req.body;
    
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: 'Students data should be an array' });
    }

    // Clear existing students and insert new ones
    await Student.deleteMany({});
    const result = await Student.insertMany(students);
    
    res.json({ 
      success: true, 
      message: 'Students saved successfully', 
      count: result.length 
    });
  } catch (err) {
    console.error('Error saving students:', err);
    res.status(500).json({ error: 'Error saving students data' });
  }
});

// Save attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const attendanceData = req.body;
    
    if (!attendanceData.date || !attendanceData.records) {
      return res.status(400).json({ error: 'Date and records are required' });
    }

    // Check if attendance for this date already exists
    const existingAttendance = await Attendance.findOne({ date: attendanceData.date });
    
    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.records = attendanceData.records;
      await existingAttendance.save();
    } else {
      // Create new attendance record
      const attendance = new Attendance(attendanceData);
      await attendance.save();
    }
    
    res.json({ 
      success: true, 
      message: 'Attendance saved successfully', 
      date: attendanceData.date 
    });
  } catch (err) {
    console.error('Error saving attendance:', err);
    res.status(500).json({ error: 'Error saving attendance data' });
  }
});

// Get all attendance dates
app.get('/api/attendance/dates', async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find().select('date -_id');
    const dates = attendanceRecords.map(record => record.date);
    res.json(dates.sort().reverse());
  } catch (err) {
    console.error('Error reading attendance dates:', err);
    res.status(500).json({ error: 'Error reading attendance data' });
  }
});

// Get attendance for a specific date
app.get('/api/attendance/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const attendance = await Attendance.findOne({ date });
    
    if (attendance) {
      res.json(attendance);
    } else {
      res.status(404).json({ error: 'Attendance record not found for this date' });
    }
  } catch (err) {
    console.error('Error reading attendance:', err);
    res.status(500).json({ error: 'Error reading attendance data' });
  }
});

// Get all attendance records with summary
app.get('/api/attendance', async (req, res) => {
  try {
    const allAttendance = await Attendance.find();
    
    const attendanceRecords = allAttendance.map(attendance => {
      const presentCount = attendance.records.filter(r => r.status === 'Present').length;
      const totalStudents = attendance.records.length;
      const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
      
      return {
        date: attendance.date,
        totalStudents,
        present: presentCount,
        absent: totalStudents - presentCount,
        attendanceRate
      };
    });
    
    res.json(attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) {
    console.error('Error reading attendance summary:', err);
    res.status(500).json({ error: 'Error reading attendance data' });
  }
});

// Search attendance records by student name
app.get('/api/attendance/search/:studentName', async (req, res) => {
  try {
    const studentName = req.params.studentName.toLowerCase();
    const allAttendance = await Attendance.find();
    
    const studentRecords = [];
    
    allAttendance.forEach(attendance => {
      attendance.records.forEach(record => {
        if (record.name.toLowerCase().includes(studentName)) {
          studentRecords.push({
            date: attendance.date,
            name: record.name,
            status: record.status,
            timestamp: record.timestamp
          });
        }
      });
    });
    
    res.json(studentRecords.sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) {
    console.error('Error searching attendance:', err);
    res.status(500).json({ error: 'Error searching attendance data' });
  }
});

// Get attendance statistics
app.get('/api/attendance/stats/overview', async (req, res) => {
  try {
    const allAttendance = await Attendance.find();
    
    if (allAttendance.length === 0) {
      return res.json({
        totalRecords: 0,
        averageAttendance: 0,
        totalClasses: 0
      });
    }
    
    let totalPresent = 0;
    let totalStudents = 0;
    
    allAttendance.forEach(attendance => {
      const presentCount = attendance.records.filter(r => r.status === 'Present').length;
      totalPresent += presentCount;
      totalStudents += attendance.records.length;
    });
    
    const averageAttendance = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;
    
    res.json({
      totalRecords: allAttendance.length,
      averageAttendance: averageAttendance,
      totalClasses: allAttendance.length
    });
  } catch (err) {
    console.error('Error reading attendance stats:', err);
    res.status(500).json({ error: 'Error reading attendance statistics' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening at http://localhost:${port}`);
});
