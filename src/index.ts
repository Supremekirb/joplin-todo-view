import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';

joplin.plugins.register({
	onStart: async function() {
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
        let notes = []
        let page_idx = 1
        let result = (await joplin.data.get(["search"], {
            fields: ["id", "is_todo", "todo_due", "todo_completed", "title", "created_time"],
            query: "type:todo",
            page: page_idx}))
        notes = notes.concat(result.items)

        console.log(notes);

        while (result.has_more) {
            page_idx++
            result = (await joplin.data.get(["search"], {
                fields: ["id", "is_todo", "todo_due", "todo_completed", "title", "created_time"], 
                query: "type:todo",
                page: page_idx}))
            notes = notes.concat(result.items)
        }

        console.log(notes);

            const itemHtml = [];
            itemHtml.push("<h1>To-do</h1>")
			if (notes) {
                const notesBeforeNow = []
                const notesAfterNow = []
                const notesNoDueDate = []
                const notesCompleted = []
                const now = Date.now()
                for (const note of notes) {
                    if (!note.is_todo) {
                        continue
                    }
                    else {
                        if (note.todo_completed) { // completed notes don't need to worry about the due date
                            notesCompleted.push(note)
                        } else {
                            if (note.todo_due) { // sort notes with a due date
                                if (note.todo_due > now) {
                                    notesAfterNow.push(note) // notes in the future
                                } else {
                                    notesBeforeNow.push(note) // notes overdue
                                }
                            } else {
                                notesNoDueDate.push(note) // notes with no due date go here
                                }
                            }
                        }
                    }

                    notesBeforeNow.sort(function(a, b) { // sort from next due to last due
                        return a.todo_due - b.todo_due
                    })
                    notesAfterNow.sort(function(a, b) { // sort from next due to last due
                        return a.todo_due - b.todo_due
                    })
                    notesNoDueDate.sort(function(a, b) { // sort from oldest to newest
                        return a.created_time - b.created_time
                    })
                    notesCompleted.sort(function(b, a) { // sort from most recent completed to oldest completed
                        return a.todo_completed - b.todo_completed
                    })
                    
                    itemHtml.push("<h2>Overdue<hr></h2>")
                    if (notesBeforeNow.length == 0) {
                        itemHtml.push("<span class=todo-lesser>No overdue to-dos!</span>")
                    } else {
                        for (const overdueNote of notesBeforeNow) {
                            itemHtml.push(noteHtml(overdueNote))
                        }
                    }
                    itemHtml.push("<h2>Upcoming<hr></h2>")
                    if (notesAfterNow.length == 0) {
                        itemHtml.push("<span class=todo-lesser>No upcoming to-dos!</span>")
                    } else {
                        for (const upcomingNote of notesAfterNow) {
                            itemHtml.push(noteHtml(upcomingNote))
                        }
                    }
                    itemHtml.push("<h2>No due date<hr></h2>")
                    if (notesNoDueDate.length == 0) {
                        itemHtml.push("<span class=todo-lesser>No to-dos without due dates.</span>")
                    } else {
                        for (const noDueNote of notesNoDueDate) {
                            itemHtml.push(noteHtml(noDueNote))
                        }
                    }
                    itemHtml.push("<h2>Completed<hr></h2>")
                    if (notesCompleted.length == 0) {
                        itemHtml.push("<span class=todo-lesser>No completed to-dos.</span>")
                    } else {
                        for (const completedNote of notesCompleted) {
                            itemHtml.push(noteHtml(completedNote))
                        }
                    }
                if (notesBeforeNow.length == 0 && notesAfterNow.length == 0 && notesCompleted.length == 0 && notesNoDueDate.length == 0) {
                    // no todo notes
                    itemHtml.length = 1 // clear all but header
                    itemHtml.push(`<p>Create a to-do to use this plugin.</p>
                        <p>If you want to hide this panel, press the <i class="fas fa-rectangle-list"></i> icon in the toolbar.</p>`)
                }
                } else { // no notes at all! what are you even using Joplin for?
                    itemHtml.length = 1
                    itemHtml.push(`<p>Create a to-do to use this plugin.</p>
                                   <p>If you want to hide this panel, press the <i class="fas fa-rectangle-list"></i> icon in the toolbar.</p>`)
                }
                await joplin.views.panels.setHtml(panel, `
					<div class="container">
						${itemHtml.join('\n')}
					</div>
                `)
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
			iconName: 'fas fa-list-ul', // seems like list-rectangle isn't supported :(
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

function escapeHtml(unsafe:string) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function noteHtml(note) {
    let formattedTitle = "<untitled>"
    if (note.title) {
        formattedTitle = note.title
    }
    let formattedDate = "No due date"
    if (note.todo_due > 0) {
        formattedDate = new Date(note.todo_due).toLocaleString()
    }
    return `
        <p class="todo-item">
            <a class="todo-goto-link" href=# data-id="${escapeHtml(note.id)}">${escapeHtml(formattedTitle)}</a>
            <span class="todo-lesser">${escapeHtml(formattedDate)}</span>
        </p>
    `;
}
