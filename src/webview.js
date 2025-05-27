document.addEventListener('click', event => {
	const element = event.target;
	if (element.className === 'todo-goto-link') {
		webviewApi.postMessage({
			name: 'openNote',
			id: element.dataset.id,
		});
	}
	if (element.className === 'todo-checkbox') {
		webviewApi.postMessage({
			name: 'setChecked',
			id: element.dataset.id,
			state: element.checked
		})
	}
})

document.addEventListener('changed', event => {
	const element = event.target;
	if (element.className === 'todo-checkbox') {
		webviewApi.postMessage({
			name: 'reload',
		})
	}
})