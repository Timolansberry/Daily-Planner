/**
 * Daily Planner - JavaScript Module
 * 
 * Features:
 * - localStorage persistence with Firebase-ready hooks
 * - Date-based planning with automatic saving
 * - Drag and drop reordering
 * - Accessibility support
 * - Mobile-first responsive design
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique ID for items
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get weekday number (0 = Sunday, 1 = Monday, etc.)
 */
function getWeekday(date) {
  return date.getDay();
}

/**
 * Debounce function to limit API calls
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Announce status changes for screen readers
 */
function announceStatus(message) {
  const announcer = document.getElementById('status-announcements');
  if (announcer) {
    announcer.textContent = message;
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }
}

// ============================================================================
// STORAGE ADAPTER (Firebase-ready)
// ============================================================================

/**
 * Storage adapter - currently uses localStorage, ready for Firebase
 */
const storage = {
  /**
   * Get planner data for a specific date
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Planner data
   */
  async get(dateStr) {
    try {
      // localStorage implementation
      const data = localStorage.getItem(`planner:${dateStr}`);
      return data ? JSON.parse(data) : null;
      
      // TODO: Replace with Firebase when ready
      // const doc = await firestore.collection('users').doc(userId).collection('planner').doc(dateStr).get();
      // return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error loading planner data:', error);
      return null;
    }
  },

  /**
   * Save planner data for a specific date
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @param {Object} data - Planner data to save
   */
  async set(dateStr, data) {
    try {
      // localStorage implementation
      localStorage.setItem(`planner:${dateStr}`, JSON.stringify(data));
      
      // TODO: Replace with Firebase when ready
      // await firestore.collection('users').doc(userId).collection('planner').doc(dateStr).set(data);
    } catch (error) {
      console.error('Error saving planner data:', error);
    }
  }
};

// ============================================================================
// DATA MODEL
// ============================================================================

/**
 * Get empty planner state
 */
function getEmptyPlan() {
  return {
    topThree: [],
    todos: [],
    schedule: {
      '06:00': '', '07:00': '', '08:00': '', '09:00': '', '10:00': '', '11:00': '',
      '12:00': '', '13:00': '', '14:00': '', '15:00': '', '16:00': '', '17:00': '',
      '18:00': '', '19:00': '', '20:00': '', '21:00': '', '22:00': '', '23:00': ''
    },
    notes: '',
    meals: {
      breakfast: '',
      lunch: '',
      dinner: ''
    },
    water: 0
  };
}

/**
 * Current planner state
 */
let currentPlan = getEmptyPlan();
let currentDate = new Date();

// ============================================================================
// PLANNER MANAGER
// ============================================================================

class PlannerManager {
  constructor() {
    this.saveDebounced = debounce(this.savePlan.bind(this), 300);
  }

  /**
   * Load planner for specific date
   */
  async loadPlan(dateStr) {
    try {
      const data = await storage.get(dateStr);
      currentPlan = data || getEmptyPlan();
      this.renderAll();
      announceStatus(`Loaded plan for ${dateStr}`);
    } catch (error) {
      console.error('Error loading plan:', error);
      currentPlan = getEmptyPlan();
      this.renderAll();
    }
  }

  /**
   * Save current plan
   */
  async savePlan() {
    const dateStr = formatDate(currentDate);
    await storage.set(dateStr, currentPlan);
    console.log(`Plan saved for ${dateStr}`);
  }

  /**
   * Trigger save with debouncing
   */
  triggerSave() {
    this.saveDebounced();
  }

  /**
   * Render all sections
   */
  renderAll() {
    this.renderTopThree();
    this.renderTodos();
    this.renderSchedule();
    this.renderNotes();
    this.renderMeals();
    this.renderWater();
  }

  // ========================================================================
  // TOP 3 SECTION
  // ========================================================================

  renderTopThree() {
    const container = document.querySelector('.top-three-list');
    container.innerHTML = '';

    for (let i = 0; i < 3; i++) {
      const item = currentPlan.topThree[i] || { id: generateId(), text: '', done: false };
      currentPlan.topThree[i] = item;

      const li = document.createElement('li');
      li.className = 'top-three-item';
      li.innerHTML = `
        <input type="checkbox" class="top-three-checkbox" ${item.done ? 'checked' : ''} 
               data-id="${item.id}" aria-label="Complete task">
        <input type="text" class="top-three-input" value="${item.text}" 
               placeholder="Priority ${i + 1}..." data-id="${item.id}">
      `;

      container.appendChild(li);
    }

    this.bindTopThreeEvents();
  }

  bindTopThreeEvents() {
    const checkboxes = document.querySelectorAll('.top-three-checkbox');
    const inputs = document.querySelectorAll('.top-three-input');

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const item = currentPlan.topThree.find(item => item.id === id);
        if (item) {
          item.done = e.target.checked;
          this.triggerSave();
          announceStatus(item.done ? 'Task completed' : 'Task uncompleted');
        }
      });
    });

    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const item = currentPlan.topThree.find(item => item.id === id);
        if (item) {
          item.text = e.target.value;
          this.triggerSave();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });
  }

  // ========================================================================
  // TODO SECTION
  // ========================================================================

  renderTodos() {
    const container = document.querySelector('.todo-list');
    const emptyState = document.getElementById('todo-empty-state');
    
    container.innerHTML = '';

    if (currentPlan.todos.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Sort by order
    const sortedTodos = [...currentPlan.todos].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedTodos.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.done ? 'done' : ''}`;
      li.draggable = true;
      li.dataset.id = todo.id;
      li.innerHTML = `
        <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} 
               aria-label="Complete task">
        <textarea class="todo-text" rows="1">${todo.text}</textarea>
        <button type="button" class="todo-delete" aria-label="Delete task">×</button>
      `;

      container.appendChild(li);
    });

    this.bindTodoEvents();
  }

  bindTodoEvents() {
    const container = document.querySelector('.todo-list');
    const addBtn = document.getElementById('add-todo-btn');
    const addInput = document.getElementById('todo-input');

    // Add new todo
    const addTodo = () => {
      const text = addInput.value.trim();
      if (!text) return;

      const todo = {
        id: generateId(),
        text: text,
        done: false,
        order: currentPlan.todos.length
      };

      currentPlan.todos.push(todo);
      addInput.value = '';
      this.renderTodos();
      this.triggerSave();
      announceStatus('Task added');
    };

    addBtn.addEventListener('click', addTodo);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addTodo();
      }
    });

    // Todo item events
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('todo-checkbox')) {
        const item = e.target.closest('.todo-item');
        const id = item.dataset.id;
        const todo = currentPlan.todos.find(t => t.id === id);
        if (todo) {
          todo.done = e.target.checked;
          item.classList.toggle('done', todo.done);
          this.triggerSave();
          announceStatus(todo.done ? 'Task completed' : 'Task uncompleted');
        }
      }
    });

    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('todo-text')) {
        const item = e.target.closest('.todo-item');
        const id = item.dataset.id;
        const todo = currentPlan.todos.find(t => t.id === id);
        if (todo) {
          todo.text = e.target.value;
          this.triggerSave();
          
          // Auto-resize textarea
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }
      }
    });

    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('todo-delete')) {
        const item = e.target.closest('.todo-item');
        const id = item.dataset.id;
        currentPlan.todos = currentPlan.todos.filter(t => t.id !== id);
        this.renderTodos();
        this.triggerSave();
        announceStatus('Task deleted');
      }
    });

    // Drag and drop
    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('todo-item')) {
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.outerHTML);
      }
    });

    container.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('todo-item')) {
        e.target.style.opacity = '';
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/html').match(/data-id="([^"]+)"/)?.[1];
      const target = e.target.closest('.todo-item');
      
      if (draggedId && target && draggedId !== target.dataset.id) {
        const draggedIndex = currentPlan.todos.findIndex(t => t.id === draggedId);
        const targetIndex = currentPlan.todos.findIndex(t => t.id === target.dataset.id);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          const draggedTodo = currentPlan.todos.splice(draggedIndex, 1)[0];
          currentPlan.todos.splice(targetIndex, 0, draggedTodo);
          
          // Update order values
          currentPlan.todos.forEach((todo, index) => {
            todo.order = index;
          });
          
          this.renderTodos();
          this.triggerSave();
        }
      }
    });
  }

  // ========================================================================
  // SCHEDULE SECTION
  // ========================================================================

  renderSchedule() {
    const container = document.querySelector('.schedule-container');
    container.innerHTML = '';

    Object.entries(currentPlan.schedule).forEach(([time, content]) => {
      const div = document.createElement('div');
      div.className = 'schedule-item';
      div.innerHTML = `
        <div class="schedule-time">${time}</div>
        <input type="text" class="schedule-input" value="${content}" 
               placeholder="Add event..." data-time="${time}">
      `;

      container.appendChild(div);
    });

    this.bindScheduleEvents();
  }

  bindScheduleEvents() {
    const inputs = document.querySelectorAll('.schedule-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const time = e.target.dataset.time;
        currentPlan.schedule[time] = e.target.value;
        this.triggerSave();
      });
    });
  }

  // ========================================================================
  // NOTES SECTION
  // ========================================================================

  renderNotes() {
    const textarea = document.getElementById('notes-textarea');
    textarea.value = currentPlan.notes;
  }

  bindNotesEvents() {
    const textarea = document.getElementById('notes-textarea');
    textarea.addEventListener('input', (e) => {
      currentPlan.notes = e.target.value;
      this.triggerSave();
    });
  }

  // ========================================================================
  // MEALS SECTION
  // ========================================================================

  renderMeals() {
    const breakfast = document.getElementById('breakfast-input');
    const lunch = document.getElementById('lunch-input');
    const dinner = document.getElementById('dinner-input');

    breakfast.value = currentPlan.meals.breakfast;
    lunch.value = currentPlan.meals.lunch;
    dinner.value = currentPlan.meals.dinner;
  }

  bindMealsEvents() {
    const inputs = document.querySelectorAll('.meal-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const meal = e.target.id.replace('-input', '');
        currentPlan.meals[meal] = e.target.value;
        this.triggerSave();
      });
    });
  }

  // ========================================================================
  // WATER SECTION
  // ========================================================================

  renderWater() {
    const container = document.querySelector('.water-dots');
    const count = document.getElementById('water-count');
    
    container.innerHTML = '';
    
    for (let i = 0; i < 8; i++) {
      const button = document.createElement('button');
      button.className = `water-dot ${i < currentPlan.water ? 'filled' : ''}`;
      button.type = 'button';
      button.dataset.index = i;
      button.setAttribute('aria-label', `Water intake ${i + 1} of 8`);
      
      container.appendChild(button);
    }
    
    count.textContent = `${currentPlan.water}/8`;
  }

  bindWaterEvents() {
    const container = document.querySelector('.water-dots');
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('water-dot')) {
        const index = parseInt(e.target.dataset.index);
        
        // Toggle water intake
        if (e.target.classList.contains('filled')) {
          // Unfill this dot and all after it
          for (let i = index; i < 8; i++) {
            currentPlan.water = i;
          }
        } else {
          // Fill up to this dot
          currentPlan.water = index + 1;
        }
        
        this.renderWater();
        this.triggerSave();
        announceStatus(`Water intake: ${currentPlan.water}/8`);
      }
    });
  }
}

// ============================================================================
// DATE MANAGEMENT
// ============================================================================

class DateManager {
  constructor(planner) {
    this.planner = planner;
    this.datePicker = document.getElementById('date-picker');
    this.weekdayBtns = document.querySelectorAll('.weekday-btn');
    
    this.init();
  }

  init() {
    // Set initial date
    this.datePicker.value = formatDate(currentDate);
    this.updateWeekdayButtons();
    
    // Bind events
    this.datePicker.addEventListener('change', (e) => {
      currentDate = new Date(e.target.value);
      this.updateWeekdayButtons();
      this.planner.loadPlan(formatDate(currentDate));
    });

    this.weekdayBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const day = parseInt(e.target.dataset.day);
        this.goToWeekday(day);
      });
    });
  }

  updateWeekdayButtons() {
    const currentWeekday = getWeekday(currentDate);
    
    this.weekdayBtns.forEach(btn => {
      const day = parseInt(btn.dataset.day);
      btn.classList.toggle('active', day === currentWeekday);
    });
  }

  goToWeekday(targetDay) {
    const currentWeekday = getWeekday(currentDate);
    const diff = targetDay - currentWeekday;
    
    currentDate.setDate(currentDate.getDate() + diff);
    this.datePicker.value = formatDate(currentDate);
    this.updateWeekdayButtons();
    this.planner.loadPlan(formatDate(currentDate));
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Create planner manager
    const planner = new PlannerManager();
    
    // Create date manager
    const dateManager = new DateManager(planner);
    
    // Bind all events
    planner.bindNotesEvents();
    planner.bindMealsEvents();
    planner.bindWaterEvents();
    
    // Load today's plan
    await planner.loadPlan(formatDate(currentDate));
    
    // Make planner globally accessible for debugging
    window.planner = planner;
    window.currentPlan = () => currentPlan;
    window.currentDate = () => currentDate;
    
    console.log('Daily Planner initialized successfully');
    
  } catch (error) {
    console.error('Error initializing planner:', error);
    announceStatus('Error loading planner');
  }
});

// ============================================================================
// FIREBASE INTEGRATION HOOKS (Ready for implementation)
// ============================================================================

/*
// TODO: Firebase integration example
// Uncomment and modify when ready to integrate Firebase

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  // Your Firebase config
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

// Update storage adapter to use Firebase
const storage = {
  async get(dateStr) {
    const user = auth.currentUser;
    if (!user) return null;
    
    const doc = await firestore.collection('users').doc(user.uid).collection('planner').doc(dateStr).get();
    return doc.exists ? doc.data() : null;
  },

  async set(dateStr, data) {
    const user = auth.currentUser;
    if (!user) return;
    
    await firestore.collection('users').doc(user.uid).collection('planner').doc(dateStr).set(data);
  }
};
*/
