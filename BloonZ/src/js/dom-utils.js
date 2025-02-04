export function createElementFromHTML(htmlString) {
  const div = document.createElement('div')
  div.innerHTML = htmlString.trim()
  return div.firstChild
}

// Add the title of the page on the top
export function addTitle() {
  const librariesUsed = document.title.slice(0, document.title.indexOf(' - '))
  const titleContent = document.title.slice(document.title.indexOf(' - ') + 3)

  const title = `
    <div class="page-title">
      <span>${librariesUsed}</span> - ${titleContent}
    </div>
  `

  const titleNode = createElementFromHTML(title)
  document.body.appendChild(titleNode)
}
