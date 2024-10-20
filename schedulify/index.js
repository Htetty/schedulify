// Using ES modules for consistency
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config(); 

console.log(process.env.API_KEY);

// Initialize Gemini with the API key from environment variables
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);  
const __dirname = path.dirname(__filename);         

// Middleware
app.use(cors({ origin: '*' }));  // Allow cross-origin requests
app.use(bodyParser.urlencoded({ extended: true }));  // Parse URL-encoded bodies
app.use(bodyParser.json());  // Parse JSON bodies

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key',  // Secret for session, set this in .env for security
  resave: false,  // Don't save session if unmodified
  saveUninitialized: true,  // Save a session even if uninitialized
  cookie: { maxAge: 3600000 }  // 1-hour session expiry
}));

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

// Route to set user schedule
app.post('/set-schedule', (req, res) => {
  const { wakeUp, lunch, dinner, sleep } = req.body;

  // Ensure all fields are provided before saving
  if (!wakeUp || !lunch || !dinner || !sleep) {
      return res.status(400).send({ error: 'All schedule fields are required' });
  }

  // Store the schedule in the session
  req.session.schedule = { wakeUp, lunch, dinner, sleep };
  
  console.log("Saved schedule:", req.session.schedule);  // Log the session schedule for debugging
  res.send('Schedule saved successfully');
});

// Route to get user schedule
app.get('/get-schedule', (req, res) => {
  if (req.session.schedule) {
    res.json(req.session.schedule);  // Return the schedule from the session
  } else {
    res.status(404).send({ message: 'No schedule found' });  // No schedule set
  }
});

// Route to analyze tasks and get suggestions from Gemini
app.post('/analyze-task', async (req, res) => {
  try {
      const { prompt } = req.body;

      // Check if the schedule is stored in the session
      const schedule = req.session.schedule;
      if (!schedule || !schedule.wakeUp || !schedule.lunch || !schedule.dinner || !schedule.sleep) {
          return res.status(400).json({ error: 'Please provide specific times for Wake up, Lunch, Dinner, and Sleep.' });
      }

      // Construct the full prompt for the AI
      const fullPrompt = `
      My schedule for today is:
      Wake up: ${schedule.wakeUp}
      Lunch: ${schedule.lunch}
      Dinner: ${schedule.dinner}
      Sleep: ${schedule.sleep}

      My tasks are: 
      "${prompt}"

      Please provide an optimized schedule that includes the new task, while respecting the existing schedule as much as possible.
      Output the schedule as a list of items, each with a time and a task.`;
      
      // Log the prompt to debug
      console.log("Prompt sent to Gemini AI:", fullPrompt);

      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const response = await model.generateContent(fullPrompt);
      const generatedText = response.response.text();

      req.session.generatedSchedule = generatedText;
      res.json({ suggestedSchedule: generatedText });

  } catch (error) {
      console.error('Error interacting with Gemini AI:', error);
      res.status(500).json({ error: 'An error occurred while processing the task.' });
  }
});

app.get('/get-generated-schedule', (req, res) => {
  if (req.session.generatedSchedule) {
    res.json({ suggestedSchedule: req.session.generatedSchedule }); 
  } else {
    res.status(404).send({ message: 'No generated schedule found' }); 
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});