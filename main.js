const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet()); // Adds security headers
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://zerotothepower1.github.io'] 
    : '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parser middleware with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection - USING YOUR EXACT CONNECTION STRING
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://chaudharsami324_db_user:VC1rvhRJSSTqHqoE@cluster0.egub0q2.mongodb.net/attendance-db?retryWrites=true&w=majority&appName=Cluster0';

const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000, // 10 seconds
  socketTimeoutMS: 45000,
  bufferCommands: false,
};

// Enhanced connection handling with retry logic
const connectWithRetry = async () => {
  try {
    await mongoose.connect(mongoURI, mongooseOptions);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection failed, retrying in 5 seconds...', err);
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// MongoDB Schemas with validation
const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  studentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  class: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const attendanceRecordSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Present', 'Absent', 'Late'],
    trim: true
  },
  timestamp: {
    type: String,
    default: () => new Date().toISOString()
  }
});

const attendanceSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  records: [attendanceRecordSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better performance
studentSchema.index({ studentId: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ 'records.name': 1 });

const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

// Validation middleware
const validateStudentsArray = (req, res, next) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Students data should be an array' });
  }
  
  const invalidStudents = req.body.filter(student => 
    !student.name || !student.studentId || !student.class
  );
  
  if (invalidStudents.length > 0) {
    return res.status(400).json({ 
      error: 'All students must have name, studentId, and class fields',
      invalidCount: invalidStudents.length
    });
  }
  
  next();
};

const validateAttendanceData = (req, res, next) => {
  const { date, records } = req.body;
  
  if (!date || !records || !Array.isArray(records)) {
    return res.status(400).json({ 
      error: 'Date and records array are required' 
    });
  }
  
  const invalidRecords = records.filter(record => 
    !record.name || !record.status
  );
  
  if (invalidRecords.length > 0) {
    return res.status(400).json({ 
      error: 'All records must have name and status fields',
      invalidCount: invalidRecords.length
    });
  }
  
  next();
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Get all students with pagination
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 }).lean();
    res.json(students);
  } catch (err) {
    console.error('Error reading students:', err);
    res.status(500).json({ error: 'Error reading students data' });
  }
});

// Save students
app.post('/api/students', validateStudentsArray, async (req, res) => {
  try {
    const students = req.body.map(student => ({
      ...student,
      name: student.name.trim(),
      studentId: student.studentId.trim(),
      class: student.class.trim()
    }));

    // Clear existing and insert new ones
    await Student.deleteMany({});
    const result = await Student.insertMany(students);

    res.json({ 
      success: true, 
      message: 'Students saved successfully', 
      count: result.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving students:', err);
    
    if (err.code === 11000) {
      res.status(400).json({ error: 'Duplicate student ID found' });
    } else {
      res.status(500).json({ error: 'Error saving students data' });
    }
  }
});

// DELETE STUDENTS FEATURE - Multiple endpoints for flexibility

// Delete all students
app.delete('/api/students', async (req, res) => {
  try {
    const result = await Student.deleteMany({});
    
    res.json({ 
      success: true, 
      message: 'All students deleted successfully',
      deletedCount: result.deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error deleting all students:', err);
    res.status(500).json({ error: 'Error deleting all students' });
  }
});

// Delete a specific student by ID
app.delete('/api/students/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    
    // Try to delete by MongoDB _id first
    let result = await Student.findByIdAndDelete(studentId);
    
    // If not found by _id, try by studentId field
    if (!result) {
      result = await Student.findOneAndDelete({ studentId: studentId });
    }
    
    if (!result) {
      return res.status(404).json({ 
        error: 'Student not found',
        message: `No student found with ID: ${studentId}`
      });
    }

    res.json({ 
      success: true, 
      message: 'Student deleted successfully',
      deletedStudent: {
        name: result.name,
        studentId: result.studentId,
        class: result.class
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Error deleting student' });
  }
});

// Delete multiple students by IDs
app.delete('/api/students/batch/delete', async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ 
        error: 'studentIds array is required in request body' 
      });
    }

    if (studentIds.length === 0) {
      return res.status(400).json({ 
        error: 'studentIds array cannot be empty' 
      });
    }

    // Delete students by their _id or studentId
    const deletePromises = studentIds.map(id => 
      Student.findOneAndDelete({ 
        $or: [{ _id: id }, { studentId: id }] 
      })
    );

    const results = await Promise.all(deletePromises);
    const deletedStudents = results.filter(result => result !== null);
    
    if (deletedStudents.length === 0) {
      return res.status(404).json({ 
        error: 'No students found with the provided IDs',
        requestedCount: studentIds.length,
        deletedCount: 0
      });
    }

    res.json({ 
      success: true, 
      message: `${deletedStudents.length} student(s) deleted successfully`,
      deletedCount: deletedStudents.length,
      notFoundCount: studentIds.length - deletedStudents.length,
      deletedStudents: deletedStudents.map(student => ({
        name: student.name,
        studentId: student.studentId,
        class: student.class
      })),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error deleting multiple students:', err);
    res.status(500).json({ error: 'Error deleting students' });
  }
});

// Save attendance
app.post('/api/attendance', validateAttendanceData, async (req, res) => {
  try {
    const { date, records } = req.body;

    const attendanceData = {
      date: date.trim(),
      records: records.map(record => ({
        name: record.name.trim(),
        status: record.status.trim(),
        timestamp: record.timestamp || new Date().toISOString()
      }))
    };

    const options = { upsert: true, new: true, setDefaultsOnInsert: true };
    const attendance = await Attendance.findOneAndUpdate(
      { date: attendanceData.date },
      attendanceData,
      options
    );

    res.json({ 
      success: true, 
      message: 'Attendance saved successfully', 
      date: attendanceData.date,
      recordCount: attendance.records.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving attendance:', err);
    res.status(500).json({ error: 'Error saving attendance data' });
  }
});

// Get all attendance dates
app.get('/api/attendance/dates', async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find().select('date -_id').lean();
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
    const attendance = await Attendance.findOne({ date }).lean();

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
    const allAttendance = await Attendance.find().select('date records').sort({ date: -1 }).lean();

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

    res.json(attendanceRecords);
  } catch (err) {
    console.error('Error reading attendance summary:', err);
    res.status(500).json({ error: 'Error reading attendance data' });
  }
});

// Search attendance records by student name
app.get('/api/attendance/search/:studentName', async (req, res) => {
  try {
    const studentName = req.params.studentName.toLowerCase().trim();

    const allAttendance = await Attendance.find({
      'records.name': { $regex: studentName, $options: 'i' }
    }).select('date records').sort({ date: -1 }).lean();

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

    res.json(studentRecords);
  } catch (err) {
    console.error('Error searching attendance:', err);
    res.status(500).json({ error: 'Error searching attendance data' });
  }
});

// Get attendance statistics
app.get('/api/attendance/stats/overview', async (req, res) => {
  try {
    const totalRecords = await Attendance.countDocuments();
    
    if (totalRecords === 0) {
      return res.json({
        totalRecords: 0,
        averageAttendance: 0,
        totalClasses: 0,
        totalStudents: 0
      });
    }

    const allAttendance = await Attendance.find().select('records').lean();
    
    let totalStudents = 0;
    let totalPresent = 0;

    allAttendance.forEach(attendance => {
      const presentCount = attendance.records.filter(r => r.status === 'Present').length;
      totalPresent += presentCount;
      totalStudents += attendance.records.length;
    });

    const averageAttendance = totalStudents > 0 
      ? Math.round((totalPresent / totalStudents) * 100) 
      : 0;

    res.json({
      totalRecords,
      averageAttendance,
      totalClasses: totalRecords,
      totalStudents,
      totalPresent
    });
  } catch (err) {
    console.error('Error reading attendance stats:', err);
    res.status(500).json({ error: 'Error reading attendance statistics' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Server listening at http://localhost:${port}`);
});

