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

/**
 * Escape HTML to prevent injection when rendering user text
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>\"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

// ============================================================================
// STORAGE ADAPTER (Firebase + localStorage fallback)
// ============================================================================

/**
 * Storage adapter - uses Firebase Firestore with localStorage fallback
 */
const storage = {
  _firebaseReady: false,
  _userId: null,

  /**
   * Initialize Firebase storage
   */
  initFirebase(userId) {
    this._firebaseReady = true;
    this._userId = userId;
    console.log('Firebase storage initialized for user:', userId);
  },

  /**
   * Get planner data for a specific date
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Planner data
   */
  async get(dateStr) {
    try {
      // Try Firebase first if available
      if (this._firebaseReady && this._userId && window.firebase) {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const plannerDoc = doc(window.firebase.db, 'users', this._userId, 'planner', dateStr);
        const docSnap = await getDoc(plannerDoc);
        
        if (docSnap.exists()) {
          console.log('Loaded from Firebase:', dateStr);
          return docSnap.data();
        }
      }
      
      // Fallback to localStorage
      const data = localStorage.getItem(`planner:${dateStr}`);
      if (data) {
        console.log('Loaded from localStorage:', dateStr);
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('Error loading planner data:', error);
      // Fallback to localStorage on error
      const data = localStorage.getItem(`planner:${dateStr}`);
      return data ? JSON.parse(data) : null;
    }
  },

  /**
   * Save planner data for a specific date
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @param {Object} data - Planner data to save
   */
  async set(dateStr, data) {
    try {
      // Save to localStorage immediately for offline support
      localStorage.setItem(`planner:${dateStr}`, JSON.stringify(data));
      
      // Try Firebase if available
      if (this._firebaseReady && this._userId && window.firebase) {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const plannerDoc = doc(window.firebase.db, 'users', this._userId, 'planner', dateStr);
        await setDoc(plannerDoc, {
          ...data,
          lastUpdated: new Date().toISOString(),
          userId: this._userId
        });
        console.log('Saved to Firebase:', dateStr);
      }
    } catch (error) {
      console.error('Error saving planner data:', error);
      // localStorage backup already saved above
    }
  },

  /**
   * Sync localStorage data to Firebase
   */
  async syncToFirebase() {
    if (!this._firebaseReady || !this._userId) return;
    
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
      
      // Get all localStorage keys
      const keys = Object.keys(localStorage).filter(key => key.startsWith('planner:'));
      
      for (const key of keys) {
        const dateStr = key.replace('planner:', '');
        const data = JSON.parse(localStorage.getItem(key));
        
        const plannerDoc = doc(window.firebase.db, 'users', this._userId, 'planner', dateStr);
        await setDoc(plannerDoc, {
          ...data,
          lastUpdated: new Date().toISOString(),
          userId: this._userId,
          synced: true
        });
      }
      
      console.log('Synced', keys.length, 'plans to Firebase');
    } catch (error) {
      console.error('Error syncing to Firebase:', error);
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
    water: 0,
    // Habits: each habit has { id, title, description, color, repeat, reminder, goal, frequency, days, createdAt, completions }
    habits: []
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

      // Normalize older/newer data shapes: ensure `habits` is an array
      if (!Array.isArray(currentPlan.habits)) {
        // If there is an older habitCompletion map, we can't reconstruct habit text here,
        // so default to an empty array. This prevents runtime errors when rendering.
        currentPlan.habits = [];
      }
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
   * Clear all data for the current date
   */
  clearAllData() {
    // Show confirmation dialog
    const confirmed = confirm(
      'Are you sure you want to clear all data for this date?\n\n' +
      'This will remove:\n' +
      '• All Top 3 priorities\n' +
      '• All To-Do items\n' +
      '• All Schedule entries\n' +
      '• All Notes\n' +
      '• All Meal plans\n' +
      '• Water intake tracking\n\n' +
      'This action cannot be undone.'
    );
    
    if (confirmed) {
      // Reset to empty plan
      currentPlan = getEmptyPlan();
      
      // Re-render all sections
      this.renderAll();
      
      // Save the empty state
      this.triggerSave();
      
      // Announce to screen reader
      announceStatus('All data cleared for this date');
      
      console.log('All data cleared for', formatDate(currentDate));
    }
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
    this.renderHabits();
  }

  // ========================================================================
  // TOP 3 SECTION
  // ========================================================================

  renderTopThree() {
    const container = document.querySelector('.top-three-list');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < 3; i++) {
      const item = currentPlan.topThree[i] || { id: generateId(), text: '', done: false };
      currentPlan.topThree[i] = item;

      const li = document.createElement('li');
      li.className = `top-three-item ${item.done ? 'done' : ''}`;
      li.innerHTML = `
        <input type="checkbox" class="top-three-checkbox" ${item.done ? 'checked' : ''} 
               data-id="${item.id}" aria-label="Complete task">
        <textarea class="top-three-input" rows="1" data-id="${item.id}" 
                  placeholder="Priority ${i + 1}...">${item.text}</textarea>
      `;

      container.appendChild(li);
    }

    // Initialize auto-resize for all top-three textareas
    const topThreeTextareas = container.querySelectorAll('.top-three-input');
    topThreeTextareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });

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
          
          // Toggle the done class on the list item
          const listItem = e.target.closest('.top-three-item');
          if (listItem) {
            listItem.classList.toggle('done', item.done);
          }
          
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
        // Auto-resize textarea
        this.autoResizeTextarea(e.target);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.target.blur();
        }
      });
    });
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  // ========================================================================
  // TODO SECTION
  // ========================================================================

  renderTodos() {
    const container = document.querySelector('.todo-list');
    const emptyState = document.getElementById('todo-empty-state');
    if (!container || !emptyState) {
      console.warn('Todo elements not found');
      return;
    }

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

    // Initialize auto-resize for all todo textareas
    const todoTextareas = container.querySelectorAll('.todo-text');
    todoTextareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });
  }

  bindTodoEvents() {
    const container = document.querySelector('.todo-list');
    const addBtn = document.getElementById('add-todo-btn');
    const addInput = document.getElementById('todo-input');

    // Check if elements exist
    if (!addBtn || !addInput) {
      console.error('Todo elements not found');
      return;
    }

    // Add new todo
    const addTodo = () => {
      const text = addInput.value.trim();
      
      if (!text) {
        return;
      }

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

    // Add event listeners (only once)
    addBtn.addEventListener('click', addTodo);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
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
          this.autoResizeTextarea(e.target);
        }
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('todo-text')) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.target.blur();
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
    if (!container) return;
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
    if (!textarea) return;
    textarea.value = currentPlan.notes;
  }

  bindNotesEvents() {
    const textarea = document.getElementById('notes-textarea');
    if (!textarea) return;
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

    if (breakfast) breakfast.value = currentPlan.meals.breakfast;
    if (lunch) lunch.value = currentPlan.meals.lunch;
    if (dinner) dinner.value = currentPlan.meals.dinner;
  }

  bindMealsEvents() {
    const inputs = document.querySelectorAll('.meal-input');
    if (!inputs || inputs.length === 0) return;
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
    if (!container || !count) return;

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
    if (!container) return;
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('water-dot')) {
        const index = parseInt(e.target.dataset.index);

        // Toggle water intake
        if (e.target.classList.contains('filled')) {
          // Unfill this dot and all after it
          currentPlan.water = index;
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

  // ========================================================================
  // HABITS SECTION
  // ========================================================================


  renderHabits() {
    const container = document.querySelector('.habits-list');
    if (!container) return;

    container.innerHTML = '';

    if (currentPlan.habits && currentPlan.habits.length > 0) {
      const today = new Date();
      const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Filter habits that should appear today
      const todaysHabits = currentPlan.habits.filter(habit => {
        // If no days specified (old habits), show every day
        if (!habit.days || habit.days.length === 0) {
          return true;
        }
        // Check if current day is in the habit's selected days
        return habit.days.includes(currentDay);
      });

      if (todaysHabits.length > 0) {
        todaysHabits.forEach(habit => {
          const li = document.createElement('li');
          li.className = 'habit-item';
          li.dataset.id = habit.id;
          
          li.innerHTML = `
            <span class="habit-text">${habit.title}</span>
            <div class="habit-actions">
              <button type="button" class="habit-action-btn no" data-action="no" aria-label="Mark as not done">✕</button>
              <button type="button" class="habit-action-btn skip" data-action="skip" aria-label="Skip for today">—</button>
              <button type="button" class="habit-action-btn yes" data-action="yes" aria-label="Mark as done">✓</button>
            </div>
          `;
          
          container.appendChild(li);
        });
      } else {
        container.innerHTML = '<li class="empty-state">No habits scheduled for today. Click + to add a new habit!</li>';
      }
    } else {
      container.innerHTML = '<li class="empty-state">No habits yet. Click + to add your first habit!</li>';
    }

    this.updateCompletionStatus();
  }

  updateCompletionStatus() {
    const completionCount = document.getElementById('completion-count');
    if (completionCount && currentPlan.habits) {
      const today = new Date();
      const currentDay = today.getDay();
      
      // Only count habits that are scheduled for today
      const todaysHabits = currentPlan.habits.filter(habit => {
        if (!habit.days || habit.days.length === 0) {
          return true;
        }
        return habit.days.includes(currentDay);
      });
      
      const completedToday = todaysHabits.filter(habit => 
        habit.completions && habit.completions[this.getTodayString()] === 'completed'
      ).length;
      
      completionCount.textContent = `${completedToday} completed`;
    }
  }

  getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  bindHabitsEvents() {
    const container = document.querySelector('.habits-list');
    const addBtn = document.getElementById('add-habit-btn');
    const modal = document.getElementById('habit-modal');
    const closeBtn = document.querySelector('.habit-modal-close');
    const form = document.querySelector('.habit-form');

    if (container) {
      container.addEventListener('click', (e) => {
        if (e.target.classList.contains('habit-action-btn')) {
          const habitItem = e.target.closest('.habit-item');
          const habitId = habitItem.dataset.id;
          const action = e.target.dataset.action;
          
          this.handleHabitAction(habitId, action);
        }
      });
    }

    // Clear any existing event listeners and bind new ones
    if (addBtn) {
      // Remove any existing listeners by cloning the element
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      
      newAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (modal) {
          modal.style.display = 'flex';
        }
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createHabit();
      });
    }

    // Tab switching
    const tabs = document.querySelectorAll('.habit-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Handle tab switching logic here
      });
    });

    // Day button toggling in modal
    const dayButtons = document.querySelectorAll('.day-btn');
    dayButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });

    // Frequency button switching
    const freqButtons = document.querySelectorAll('.freq-btn');
    freqButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        freqButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  handleHabitAction(habitId, action) {
    const habit = currentPlan.habits.find(h => h.id === habitId);
    if (!habit) return;

    const today = this.getTodayString();
    if (!habit.completions) habit.completions = {};

    if (action === 'yes') {
      habit.completions[today] = 'completed';
    } else if (action === 'no') {
      habit.completions[today] = 'not_done';
    } else if (action === 'skip') {
      habit.completions[today] = 'skipped';
    }

    this.triggerSave();
    this.updateCompletionStatus();
    announceStatus(`Habit ${action === 'yes' ? 'completed' : action === 'no' ? 'marked as not done' : 'skipped'}`);
  }

  createHabit() {
    const title = document.getElementById('habit-title').value.trim();
    const description = document.getElementById('habit-description').value.trim();
    const color = document.getElementById('habit-color').value;
    const repeat = document.getElementById('habit-repeat').checked;
    const reminder = document.getElementById('habit-reminder').checked;
    const goal = document.getElementById('habit-goal').checked;

    if (!title) {
      announceStatus('Please enter a habit title');
      return;
    }

    // Get selected days
    const selectedDays = [];
    const dayButtons = document.querySelectorAll('.day-btn.active');
    dayButtons.forEach(btn => {
      selectedDays.push(parseInt(btn.dataset.day));
    });

    // Get selected frequency
    const activeFreqBtn = document.querySelector('.freq-btn.active');
    const frequency = activeFreqBtn ? activeFreqBtn.dataset.freq : 'daily';

    const habit = {
      id: generateId(),
      title: title,
      description: description,
      color: color,
      repeat: repeat,
      reminder: reminder,
      goal: goal,
      frequency: frequency,
      days: selectedDays,
      createdAt: new Date().toISOString(),
      completions: {}
    };

    // Ensure habits array exists
    if (!currentPlan.habits) {
      currentPlan.habits = [];
    }
    
    currentPlan.habits.push(habit);
    
    console.log('Created habit:', habit);
    console.log('All habits:', currentPlan.habits);

    this.triggerSave();
    this.renderHabits();
    
    // Close modal and reset form
    document.getElementById('habit-modal').style.display = 'none';
    document.querySelector('.habit-form').reset();
    
    announceStatus('Habit created successfully');
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
// THEME MANAGEMENT
// ============================================================================

class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'dark';
    this.init();
  }

  init() {
    // Set initial theme
    this.setTheme(this.currentTheme);
    
    // Bind theme toggle events
    document.addEventListener('click', (e) => {
      if (e.target.closest('#theme-toggle')) {
        this.toggleTheme();
      }
    });
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update theme toggle button text
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      const icon = themeToggle.querySelector('.theme-icon');
      const text = themeToggle.querySelector('.theme-text');
      
      if (theme === 'light') {
        icon.textContent = '☀️';
        text.textContent = 'Light Mode';
      } else {
        icon.textContent = '🌙';
        text.textContent = 'Dark Mode';
      }
    }
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    announceStatus(`Switched to ${newTheme} mode`);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Global app instance
let plannerApp = null;
let themeManager = null;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[planner] DOMContentLoaded — starting init');
  try {
    // Create theme manager
    themeManager = new ThemeManager();
    
    // Create planner manager
    const planner = new PlannerManager();
    
    // Create date manager
    const dateManager = new DateManager(planner);
    
    // Bind all events (each in its own try/catch so one failure doesn't stop init)
    try { planner.bindNotesEvents(); } catch (err) { console.warn('bindNotesEvents failed', err); }
    try { planner.bindMealsEvents(); } catch (err) { console.warn('bindMealsEvents failed', err); }
    try { planner.bindWaterEvents(); } catch (err) { console.warn('bindWaterEvents failed', err); }
    try { planner.bindTodoEvents(); } catch (err) { console.warn('bindTodoEvents failed', err); }

    // Bind habits (habit-builder page) separately
    try { planner.bindHabitsEvents(); } catch (err) { console.warn('bindHabitsEvents failed', err); }
    try { planner.renderHabits(); } catch (err) { console.warn('renderHabits failed', err); }
    
    // Bind clear all buttons only on the planner (index) page
    // Determine current page filename ('' or 'index.html' considered planner)
    const pageName = window.location.pathname.split('/').pop();
    const isPlannerPage = (!pageName || pageName === 'index.html' || pageName === 'index.htm');

    const clearBtnMobile = document.getElementById('clear-all-btn-mobile');
    const clearBtnDesktop = document.getElementById('clear-all-btn-desktop');

    if (isPlannerPage) {
      if (clearBtnMobile) {
        clearBtnMobile.style.display = '';
        clearBtnMobile.addEventListener('click', () => planner.clearAllData());
      }
      if (clearBtnDesktop) {
        clearBtnDesktop.style.display = '';
        clearBtnDesktop.addEventListener('click', () => planner.clearAllData());
      }
    } else {
      // Hide clear-all controls on non-planner pages to avoid confusion
      const els = document.querySelectorAll('.clear-all-btn');
      els.forEach(el => {
        el.style.display = 'none';
      });
    }
    
    // Bind back to top button
    const backToTopBtn = document.getElementById('back-to-top-btn');
    if (backToTopBtn) {
      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
        announceStatus('Scrolled to top');
      });
      
      // Show/hide button based on scroll position
      const toggleBackToTopButton = () => {
        const scrollPosition = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Show button when scrolled down more than 300px or near bottom
        const shouldShow = scrollPosition > 300 || 
                          (scrollPosition + windowHeight) >= (documentHeight - 100);
        
        if (shouldShow) {
          backToTopBtn.classList.add('visible');
        } else {
          backToTopBtn.classList.remove('visible');
        }
      };
      
      // Check on scroll
      window.addEventListener('scroll', toggleBackToTopButton);
      
      // Check on initial load
      toggleBackToTopButton();
    }
    
    // Load today's plan
    await planner.loadPlan(formatDate(currentDate));
    
    // Make planner globally accessible for debugging
    window.planner = planner;
    window.currentPlan = () => currentPlan;
    window.currentDate = () => currentDate;
    window.plannerApp = planner;
    
    // Store app instance for Firebase initialization
    plannerApp = planner;
    
    console.log('Daily Planner initialized successfully');
    console.log('[planner] init complete');
    // Close nav when clicking outside the panel (backdrop area)
    document.addEventListener('click', (e) => {
      const root = document.documentElement;
      const header = document.querySelector('.header');
      const nav = document.querySelector('.app-nav');
      const toggle = document.getElementById('nav-toggle');
      if (!nav) return;

      // If nav is open via root or header class
      const open = root.classList.contains('nav-open') || (header && header.classList.contains('nav-open'));
      if (!open) return;

      // If click is inside the nav or on the toggle, do nothing
      if (e.target.closest && (e.target.closest('.app-nav') || e.target.closest('#nav-toggle'))) return;

      // Otherwise close the nav
      if (header) header.classList.remove('nav-open');
      root.classList.remove('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
    
  } catch (error) {
    console.error('Error initializing planner:', error);
    announceStatus('Error loading planner');
    // show an on-page banner to help debugging if init fails
    try {
      const b = document.createElement('div');
      b.style.position = 'fixed';
      b.style.left = '0';
      b.style.right = '0';
      b.style.top = '0';
      b.style.background = 'rgba(200,30,30,0.9)';
      b.style.color = '#fff';
      b.style.padding = '10px';
      b.style.zIndex = 9999;
      b.textContent = 'Error initializing planner — see console for details';
      document.body.appendChild(b);
    } catch (err) { /* ignore */ }
  }
});

// Firebase initialization handler
window.initWithFirebase = async function(userId) {
  try {
    console.log('Initializing Firebase integration for user:', userId);
    
    // Initialize storage with Firebase
    storage.initFirebase(userId);
    
    // Sync existing localStorage data to Firebase
    await storage.syncToFirebase();
    
    // Reload current plan to get Firebase data if available
    if (plannerApp) {
      await plannerApp.loadPlan(formatDate(currentDate));
    }
    
    announceStatus('Connected to cloud storage');
    console.log('Firebase integration complete');
    
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    announceStatus('Using local storage only');
  }
};

// ============================================================================
// FIREBASE INTEGRATION COMPLETE
// ============================================================================

/*
Firebase integration is now complete and includes:

✅ Firebase App initialization with your project config
✅ Firestore database integration
✅ Anonymous authentication for demo purposes
✅ Hybrid storage (Firebase + localStorage fallback)
✅ Automatic data syncing
✅ Offline support with localStorage backup
✅ User-specific data storage

The app will:
1. Sign in users anonymously
2. Store data in Firestore under users/{uid}/planner/{date}
3. Fall back to localStorage if Firebase is unavailable
4. Sync existing localStorage data to Firebase on first connection
5. Save to both Firebase and localStorage for reliability

To customize authentication, replace the anonymous sign-in with your preferred method.
*/
