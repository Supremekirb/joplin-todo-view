import joplin from 'api';
import { SettingItemType, ToolbarButtonLocation } from 'api/types';

const fa5PluginIcon = 'fas fa-list-ul'

enum displayStyles {
    Card, // new style
    List, // classic style
}

const settingsSectionName = 'todo-view-settings'
const settingDisplayStyle = 'todo-view-style'

const registerSettings = async () => {
    const sectionName = settingsSectionName;
    await joplin.settings.registerSection(sectionName, {
        label: "To-do View",
        iconName: fa5PluginIcon
    })

    await joplin.settings.registerSettings({
        [settingDisplayStyle]: {
            section: sectionName,
            label: "To-do item display style",
            description: 
                "Card is the modern and default style. List is the older but more compact style.",
            public: true,
            type: SettingItemType.Int,
            value: displayStyles.Card,
            isEnum: true,
            options: {
                [displayStyles.Card]: "Card",
                [displayStyles.List]: "List"
            }

        }
    })
}


joplin.plugins.register({
	onStart: async function() {
        // Register settings
        await registerSettings();
        // Settings change handler
        joplin.settings.onChange(async (event) => {
            await updateTodoView()
        })
        

		// Create the panel object
        const panel = await joplin.views.panels.create('todo_panel');
		await joplin.views.panels.addScript(panel, './webview.css');
        await joplin.views.panels.addScript(panel, './webview.js');

        // Set some initial content while the todo list is being created
        await joplin.views.panels.setHtml(panel, 'Loading todo list...');

        // goto note
        await joplin.views.panels.onMessage(panel, (message:any) => {
			if (message.name === 'openNote') {
				joplin.commands.execute('openNote', message.id)
			}
		});

		async function updateTodoView() {
            // Fetch all todo notes with pagination
            async function fetchAllTodos() {
                const fields = ["id", "todo_due", "todo_completed", "title", "created_time"];
                const query = "type:todo";
                let notes = [];
                let page = 1;
                
                while (true) {
                    const result = await joplin.data.get(["search"], {fields: fields, query: query, page: page});
                    notes = notes.concat(result.items);
                    if (!result.has_more) break;
                    page++;
                }
                return notes;
            }
        
            try {
                const notes = await fetchAllTodos();
                
                if (!notes || !notes.length) {
                    await joplin.views.panels.setHtml(panel, `
                        <div class="container">
                            <h1>To-do</h1>
                            ${generateEmptyStateHtml()}
                        </div>
                    `);
                    return;
                }
        
                const categories = categorizeNotes(notes);
                const hasAnyTodos = Object.values(categories).some(category => category.length > 0);
                const style = await joplin.settings.value(settingDisplayStyle)
        
                const content = hasAnyTodos
                    ? `
                        <h1>To-do</h1>
                        ${generateCategoryHtml('Overdue', categories.overdue, style)}
                        ${generateCategoryHtml('Upcoming', categories.upcoming, style)}
                        ${generateCategoryHtml('No due date', categories.noDueDate, style)}
                        ${generateCategoryHtml('Completed', categories.completed, style)}
                    `
                    : `
                        <h1>To-do</h1>
                        ${generateEmptyStateHtml()}
                    `;
        
                await joplin.views.panels.setHtml(panel, `
                    <div class="container">
                        ${content}
                    </div>
                `);
        
            } catch (error) {
                console.error('Error updating todo view:', error);
                // Optionally show error state to user
            }
        }

        // Event handling
        // Currently borked:
            // todo state change on a note that isn't selected
            // deletion of notes
        // Workaround is to just select another note of course
        joplin.workspace.onNoteChange(() => {
            updateTodoView();
        });
        joplin.workspace.onNoteSelectionChange  (() => {
            updateTodoView();
        });
        joplin.workspace.onSyncComplete(() => {
            updateTodoView();
        });
        joplin.workspace.onNoteAlarmTrigger(() => {
            updateTodoView();
        });

        // Register panel toggle button & menu command
        await joplin.commands.register({
			name: 'toggleTodoView',
			label: 'Toggle to-do view',
			iconName: fa5PluginIcon, // seems like list-rectangle isn't supported :(
			execute: async () => {
				const isVisible = await joplin.views.panels.visible(panel);
				await joplin.views.panels.show(panel, !isVisible);
			},
		});
		await joplin.views.toolbarButtons.create('toggleTodoViewButton', 'toggleTodoView', ToolbarButtonLocation.NoteToolbar);
        await joplin.views.menus.create("todoMenu", "To-do", [
            {
                label: "Toggle to-do view",
                commandName: "toggleTodoView",
                accelerator: "CmdOrCtrl+Shift+T"
            }
        ])

        // Also update the todo view when the plugin starts
        updateTodoView();
	},
});

// Categorize notes by their status
function categorizeNotes(notes) {
    const now = Date.now();
    const categories = {
        overdue: [],
        upcoming: [],
        noDueDate: [],
        completed: []
    };

    notes.forEach(note => {
        if (note.todo_completed) {
            categories.completed.push(note);
        } else if (note.todo_due) {
            categories[note.todo_due > now ? 'upcoming' : 'overdue'].push(note);
        } else {
            categories.noDueDate.push(note);
        }
    });

    // Sort all categories
    const sortByDate = (a, b) => a.todo_due - b.todo_due;
    categories.overdue.sort(sortByDate);
    categories.upcoming.sort(sortByDate);
    categories.noDueDate.sort((a, b) => a.created_time - b.created_time);
    categories.completed.sort((a, b) => b.todo_completed - a.todo_completed);

    return categories;
}

function escapeHtml(unsafe:string) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// Generate empty state HTML
function generateEmptyStateHtml() {
    return `
        <p>Create a to-do to use this plugin.</p>
        <p>If you want to hide this panel, press the list icon in the toolbar.</p>
    `;
}

function noteHtml(note, style) {
    let formattedTitle = "<untitled>"
    if (note.title) {
        formattedTitle = note.title
    }
    let formattedDate = "No due date"
    if (note.todo_due > 0) {
        formattedDate = new Date(note.todo_due).toLocaleString()
    }

    switch (style) {
        // note: class "todo-goto-link" is for use in webview.js, not webview.css.
        // don't make the same mistake I did and remove it because it's not in webview.css!
        case (displayStyles.Card): {
            return `
            <div class="todo-item">
                <a class="todo-goto-link" href=# data-id="${escapeHtml(note.id)}"> 
                    <div class="todo-content">
                        <div class="todo-title">${escapeHtml(formattedTitle)}</div>
                        <div class="todo-lesser">${escapeHtml(formattedDate)}</div>
                    </div>
                </a>
            </div>
            `
        }
        case (displayStyles.List): {
            return `
            <p class="old-todo-item">
                <a class="todo-goto-link" href=# data-id="${escapeHtml(note.id)}">${escapeHtml(formattedTitle)}</a>
                <span class="old-todo-lesser">${escapeHtml(formattedDate)}</span>
            </p>
            `
        }
    }
}

// Generate HTML for a category
function generateCategoryHtml(title, notes, style) {
    const content = notes.length === 0 
    ? `<span class="todo-lesser">No ${title.toLowerCase()} to-dos${title === 'Overdue' ? '!' : '.'}</span>`
    : notes.map(note => noteHtml(note, style)).join('\n');

    return `
        <h2>${title}<hr></h2>
        ${content}
    `;
}

