import joplin from 'api';
import { SettingItemType, ToolbarButtonLocation } from 'api/types';

const fa5PluginIcon = 'fas fa-list-ul'

const enum displayStyles {
    Card, // new style
    List, // classic style
}

const enum backgroundStyles {
    Editor, // match edtior. --joplin-background-color
    Default, // match note sidebar. --joplin-background-color3
}

const enum todoCategories {
    Overdue,
    Upcoming,
    NoDue,
    Completed
}

const todoCategoryHTMLIDs = {
    [todoCategories.Overdue]: "todo-category-overdue",
    [todoCategories.Upcoming]: "todo-category-upcoming",
    [todoCategories.NoDue]: "todo-category-nodue",
    [todoCategories.Completed]: "todo-category-completed"
}

const todoCategoryHTMLIDBackrefs = {
    [todoCategoryHTMLIDs[todoCategories.Overdue]]: todoCategories.Overdue,
    [todoCategoryHTMLIDs[todoCategories.Upcoming]]: todoCategories.Upcoming,
    [todoCategoryHTMLIDs[todoCategories.NoDue]]: todoCategories.NoDue,
    [todoCategoryHTMLIDs[todoCategories.Completed]]: todoCategories.Completed
}

var collapsedCategories = {
    [todoCategories.Overdue]: false,
    [todoCategories.Upcoming]: false,
    [todoCategories.NoDue]: false,
    [todoCategories.Completed]: false,
}

const settingsSectionName = 'todo-view-settings'
const settingDisplayStyle = 'todo-view-style'
const settingTruncateMidnight = 'todo-view-truncate-midnight'
const settingHideCompleted = 'todo-view-hide-completed'
const settingShowCheckbox = 'todo-view-show-checkbox'
const settingBackgroundStyle = 'todo-view-bg-style'

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
        },
        [settingTruncateMidnight]: {
            section: sectionName,
            label: "Hide due time when set to midnight",
            description:
                "If a to-do item's due time-of-day is set to midnight, only display the due date.",
            public: true,
            type: SettingItemType.Bool,
            value: true,
        },
        [settingHideCompleted]: {
            section: sectionName,
            label: "Hide completed to-do items",
            public: true,
            type: SettingItemType.Bool,
            value: false
        },
        [settingShowCheckbox]: {
            section: sectionName,
            label: "Show checkboxes on to-do items",
            description:
                "Display a checkbox that allows to-do completion to be toggled.",
            public: true,
            type: SettingItemType.Bool,
            value: true
        },
        [settingBackgroundStyle]: {
            section: sectionName,
            label: "To-do panel background style",
            description:
                "The background colour can be changed to make it distinct from the editing space.",
            public: true,
            type: SettingItemType.Int,
            value: backgroundStyles.Default,
            isEnum: true,
            options: {
                [backgroundStyles.Default]: "Default",
                [backgroundStyles.Editor]: "Match editor",
            }
        }
    })
}


joplin.plugins.register({
    onStart: async function () {
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

        // Message handling
        await joplin.views.panels.onMessage(panel, async (message: any) => {
            switch (message.name) {
                // goto note
                case 'openNote': {
                    joplin.commands.execute('openNote', message.id)
                    break;
                }
                // toggle todo state
                case 'setChecked': {
                    await joplin.data.put(["notes", message.id], null, {
                        todo_completed: message.state ? Date.now() : 0
                    })
                    await updateTodoView()
                    break;
                }
                // collapse/expand a category
                case 'toggleCategory': {
                    collapsedCategories[todoCategoryHTMLIDBackrefs[message.elementID]] = message.collapsed
                    break;
                }
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
                    const result = await joplin.data.get(["search"], { fields: fields, query: query, page: page });
                    notes = notes.concat(result.items);
                    if (!result.has_more) break;
                    page++;
                }
                return notes;
            }

            try {
                // set background colour
                let bgCss = "background-color:var(--joplin-background-color3)"
                const bgStyle: backgroundStyles = await joplin.settings.value(settingBackgroundStyle)
                switch (bgStyle) {
                    case backgroundStyles.Editor: {
                        bgCss = "background-color:var(--joplin-background-color)"
                        break;
                    }
                    case backgroundStyles.Default: {
                        bgCss = "background-color:var(--joplin-background-color3)"
                        break;
                    }
                }

                // generate the html
                const notes = await fetchAllTodos();

                if (!notes || !notes.length) {
                    await joplin.views.panels.setHtml(panel, `
                        <div class="container" style=${bgCss}>
                            <h1>To-do</h1>
                            ${generateEmptyStateHtml()}
                        </div>
                    `);
                    return;
                }

                const categories = categorizeNotes(notes);
                const hasAnyTodos = Object.values(categories).some(category => category.length > 0);
                const style = await joplin.settings.value(settingDisplayStyle)
                const truncateMidnight = await joplin.settings.value(settingTruncateMidnight)
                const hideCompleted = await joplin.settings.value(settingHideCompleted)
                const showCheckbox = await joplin.settings.value(settingShowCheckbox)

                const content = hasAnyTodos
                    ? `
                        <h1>To-do</h1>
                        ${generateCategoryHtml(todoCategories.Overdue, 'Overdue', categories.overdue, style, truncateMidnight, showCheckbox)}
                        ${generateCategoryHtml(todoCategories.Upcoming, 'Upcoming', categories.upcoming, style, truncateMidnight, showCheckbox)}
                        ${generateCategoryHtml(todoCategories.NoDue, 'No due date', categories.noDueDate, style, truncateMidnight, showCheckbox)}
                        ${!hideCompleted ? generateCategoryHtml(todoCategories.Completed, 'Completed', categories.completed, style, truncateMidnight, showCheckbox) : ""}
                    `
                    : `
                        <h1>To-do</h1>
                        ${generateEmptyStateHtml()}
                    `;

                await joplin.views.panels.setHtml(panel, `
                    <div class="container" style=${bgCss}>
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
        joplin.workspace.onNoteSelectionChange(() => {
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

function escapeHtml(unsafe: string) {
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

function noteHtml(note, style, truncate_midnight, show_checkbox) {
    let formattedTitle = "<untitled>"
    if (note.title) {
        formattedTitle = note.title
    }
    let formattedDate = "No due date"
    if (note.todo_due > 0) {
        let dueDate = new Date(note.todo_due)
        // There's probably a better way to check midnightyness.
        // Ideas:
        // - AND some magic number onto the unix timestamp
        // - Get string and check if it's "00:00:00"
        if (truncate_midnight &&
            dueDate.getHours() === 0 && dueDate.getMinutes() === 0 && dueDate.getSeconds() === 0 && dueDate.getMilliseconds() === 0) {
            formattedDate = dueDate.toLocaleDateString()
        }
        else {
            formattedDate = dueDate.toLocaleString()
        }
    }
    let checkbox = show_checkbox ? `<input class="todo-checkbox" type="checkbox" data-id="${escapeHtml(note.id)}" ${note.todo_completed ? "checked" : ""}>` : ''

    switch (style) {
        // note: class "todo-goto-link" is for use in webview.js, not webview.css.
        // don't make the same mistake I did and remove it because it's not in webview.css!
        case (displayStyles.Card): {
            return `
            <div class="todo-item">
                ${checkbox}
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
                ${checkbox}
                <a class="todo-goto-link" href=# data-id="${escapeHtml(note.id)}">${escapeHtml(formattedTitle)} <span class="old-todo-lesser">${escapeHtml(formattedDate)}</span></a>
            </p>
            `
        }
    }
}

// Generate HTML for a category
function generateCategoryHtml(category, title, notes, style, truncate_midnight, show_checkbox) {
    const content = notes.length === 0
        ? `<span class="todo-lesser todo-no-items">No ${title.toLowerCase()} to-dos${category === todoCategories.Overdue ? '!' : '.'}</span>`
        : notes.map(note => noteHtml(note, style, truncate_midnight, show_checkbox)).join('\n');

    return `
        <button type="button" class="todo-header-collapse${collapsedCategories[category] ? '' : ' todo-header-active'}">${title}</button>
        <hr>
        <div id="${todoCategoryHTMLIDs[category]}" class="todo-item-list"${collapsedCategories[category] ? ' style="max-height: 0px"' : ''}>
        ${content}
        </div>
    `;
}

