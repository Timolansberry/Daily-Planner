# Daily Planner

A responsive daily planner web app with a dark blue + electric blue theme, built with vanilla HTML, CSS, and JavaScript. Features Firebase Firestore integration with localStorage fallback for offline support.

## Features

- 📱 **Mobile-first responsive design** - Works great on phones and desktop
- 🎨 **Dark blue + electric blue theme** - Easy on the eyes with CSS variables for easy theming
- 📅 **Date-based planning** - Each day has its own separate planner state
- ✅ **Top 3 priorities** - Focus on your most important tasks
- 📝 **To-do list** - Add, edit, delete, and reorder tasks with drag & drop
- ⏰ **Schedule** - Hourly time slots from 6 AM to 11 PM
- 🍽️ **Meals tracking** - Plan breakfast, lunch, and dinner
- 💧 **Water intake** - Track daily hydration with 8 clickable dots
- 📄 **Notes section** - Free-form notes for thoughts and reminders
- 🔥 **Firebase integration** - Real-time cloud storage with automatic syncing
- 💾 **localStorage fallback** - Works offline with data backup
- ♿ **Accessibility** - ARIA labels, keyboard navigation, screen reader support

## Firebase Integration

The app supports Firebase integration with secure configuration: 

✅ **Secure config management** - API keys not exposed in source code  
✅ **Firestore database integration** for cloud storage  
✅ **Anonymous authentication** for demo purposes  
✅ **Hybrid storage** (Firebase + localStorage fallback)  
✅ **Automatic data syncing** from localStorage to Firebase  
✅ **Offline support** with localStorage backup  
✅ **User-specific data storage** in Firestore  

### 🔒 Secure Setup

**For Production:**
1. Copy `firebase-config.example.js` to `firebase-config.js`
2. Add your Firebase project configuration to the new file
3. The `firebase-config.js` file is ignored by git (see `.gitignore`)
4. Your API keys will be secure and not visible in the repository

**For Development:**
- The app works with localStorage only if no Firebase config is provided
- No sensitive data is exposed in the source code  

### Data Storage Structure
```
users/
  {uid}/
    planner/
      YYYY-MM-DD/
        - topThree: array of priority tasks
        - todos: array of todo items
        - schedule: object with hourly events
        - notes: string of daily notes
        - meals: object with breakfast/lunch/dinner
        - water: number of water dots filled
        - lastUpdated: timestamp
        - userId: user identifier
```

## Quick Start

1. **Open the app**: Simply open `index.html` in your web browser
2. **Automatic setup**: The app will sign you in anonymously and connect to Firebase
3. **Start planning**: The app loads today's date by default
4. **Navigate dates**: Use the date picker or weekday buttons to switch days
5. **Add tasks**: Type in the Top 3 or To-Do sections
6. **Plan your day**: Fill in your schedule, meals, and notes
7. **Track water**: Click the water dots to track your daily intake
8. **Data syncs**: Everything automatically saves to Firebase and localStorage

## Technical Details

### Firebase Configuration
The app uses your Firebase project configuration:
- **Project ID**: portfolio-projects-1d337
- **Authentication**: Anonymous sign-in for demo
- **Database**: Firestore for real-time data storage
- **Fallback**: localStorage for offline support

### Color Theme
The app uses CSS custom properties for easy theming:
- `--bg: #0b1220` (very dark blue background)
- `--surface: #0f1a2b` (card backgrounds)
- `--primary: #0d47a1` (dark blue)
- `--accent: #00b3ff` (electric blue accents)
- `--text: #e6eef8` (light text)
- `--muted: #9fb3c8` (muted text)

## Deployment

The app is deployed at: [http://timothylansberry.com/Daily-Planner/](http://timothylansberry.com/Daily-Planner/)

## Development

Built with Cursor AI and Firebase integration for a modern, accessible daily planning experience.
