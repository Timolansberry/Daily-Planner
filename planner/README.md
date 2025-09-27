# Daily Planner

A responsive daily planner web app with a dark blue + electric blue theme, built with vanilla HTML, CSS, and JavaScript. Features localStorage persistence with Firebase-ready hooks for future integration.

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
- 💾 **localStorage persistence** - Data automatically saves and loads
- ♿ **Accessibility** - ARIA labels, keyboard navigation, screen reader support
- 🔥 **Firebase-ready** - Clean storage adapters ready for Firestore integration

## Quick Start

1. **Open the app**: Simply open `index.html` in your web browser
2. **Start planning**: The app loads today's date by default
3. **Navigate dates**: Use the date picker or weekday buttons to switch days
4. **Add tasks**: Type in the Top 3 or To-Do sections
5. **Plan your day**: Fill in your schedule, meals, and notes
6. **Track water**: Click the water dots to track your daily intake

## File Structure

```
planner/
├── index.html          # Main HTML structure
├── styles.css          # CSS with theme variables and responsive design
├── script.js           # JavaScript with modules and localStorage
├── assets/             # Optional assets folder for icons
└── README.md           # This file
```

## Technical Details

### Color Theme
The app uses CSS custom properties for easy theming:
- `--bg: #0b1220` (very dark blue background)
- `--surface: #0f1a2b` (card backgrounds)
- `--primary: #0d47a1` (dark blue)
- `--accent: #00b3ff` (electric blue accents)
- `--text: #e6eef8` (light text)
- `--muted: #9fb3c8` (muted text)

### Data Storage
- **Current**: localStorage with key format `planner:YYYY-MM-DD`
- **Future**: Firebase Firestore integration ready

### Responsive Breakpoints
- **Mobile**: < 768px (single column layout)
- **Tablet**: 768px+ (two column layout)
- **Desktop**: 1024px+ (refined spacing)

## Firebase Integration

The app is designed with Firebase integration in mind. To add Firebase support:

1. **Install Firebase**:
   ```bash
   npm install firebase
   ```

2. **Update the storage adapter** in `script.js`:
   ```javascript
   // Replace the localStorage implementation with Firebase
   const storage = {
     async get(dateStr) {
       const user = auth.currentUser;
       if (!user) return null;
       
       const doc = await firestore
         .collection('users')
         .doc(user.uid)
         .collection('planner')
         .doc(dateStr)
         .get();
       return doc.exists ? doc.data() : null;
     },

     async set(dateStr, data) {
       const user = auth.currentUser;
       if (!user) return;
       
       await firestore
         .collection('users')
         .doc(user.uid)
         .collection('planner')
         .doc(dateStr)
         .set(data);
     }
   };
   ```

3. **Add authentication** as needed for user-specific data

## Data Schema

The planner data structure:
```json
{
  "topThree": [
    {"id": "unique-id", "text": "Task text", "done": false}
  ],
  "todos": [
    {"id": "unique-id", "text": "Task text", "done": false, "order": 0}
  ],
  "schedule": {
    "06:00": "Event description",
    "07:00": "Another event",
    // ... all hours from 6 AM to 11 PM
  },
  "notes": "Free-form notes text",
  "meals": {
    "breakfast": "Breakfast description",
    "lunch": "Lunch description", 
    "dinner": "Dinner description"
  },
  "water": 5  // Number of water dots filled (0-8)
}
```

## Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## Accessibility Features

- Semantic HTML structure
- ARIA labels and roles
- Keyboard navigation support
- Screen reader announcements
- High contrast mode support
- Reduced motion support
- Focus indicators

## Development

### Debugging
The app exposes debugging helpers in the browser console:
- `window.planner` - Access to the planner manager
- `window.currentPlan()` - Get current plan data
- `window.currentDate()` - Get current date

### Testing
- Open browser dev tools
- Test responsive design with device emulation
- Verify localStorage data in Application tab
- Check accessibility with browser extensions

## Future Enhancements

- [ ] PWA support with service worker
- [ ] Export to PDF/PNG
- [ ] Duplicate yesterday's plan
- [ ] Simple statistics dashboard
- [ ] Dark/light theme toggle
- [ ] Data export/import
- [ ] Collaboration features

## License

MIT License - feel free to use and modify as needed.
