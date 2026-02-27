document.addEventListener('click', async event => {
	const element = event.target;
	if (element.className === 'todo-checkbox') {
		webviewApi.postMessage({
			name: 'setChecked',
			id: element.dataset.id,
			state: element.checked
		})
	}
	else {
		var gotoLink = element.closest(".todo-goto-link")
		if (gotoLink) {
			webviewApi.postMessage({
				name: 'openNote',
				id: gotoLink.dataset.id
			})
			return
		}

		var collapseButton = element.closest(".todo-header-collapse")
		if (collapseButton) {
			// An additional `nextElementSibling` to skip the <hr>
			var content = collapseButton.nextElementSibling.nextElementSibling
			// Hack: If it's the first collapse we do, set the height to something calculated
			//       so that the transition animation plays properly.
			if (content.style.maxHeight == '') {
				content.classList.toggle("force-disable-transition", true)
				content.style.maxHeight = content.scrollHeight + "px"
				content.classList.toggle("force-disable-transition", false)
				// Delay very shortly to allow the change to the style to be computed.
				// Yes this is hacky, no I couldn't figure out a better way ...
				await new Promise(res => setTimeout(res, 1))
			}
			// Then collapse/expand
			if (content.style.maxHeight != "0px") {
				content.style.maxHeight = "0px"
				collapseButton.classList.toggle("todo-header-active", false)
				webviewApi.postMessage({
					name: 'toggleCategory',
					elementID: content.id,
					collapsed: true
				})
			} else {
				content.style.maxHeight = content.scrollHeight + "px"
				collapseButton.classList.toggle("todo-header-active", true)
				webviewApi.postMessage({
					name: 'toggleCategory',
					elementID: content.id,
					collapsed: false
				})
			}
		}
	}
})