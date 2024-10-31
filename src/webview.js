document.addEventListener('click', event => {
	const element = event.target;
	if (element.className === 'todo-goto-link') {
		webviewApi.postMessage({
			name: 'openNote',
			id: element.dataset.id,
		});
	}
})