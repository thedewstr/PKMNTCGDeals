(function () {
  const stored = localStorage.getItem('theme');
  const preferDark = stored
    ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.documentElement.classList.toggle('dark', preferDark);
})();

const themeButton = document.getElementById('themeToggle');

if (themeButton) {
  themeButton.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}