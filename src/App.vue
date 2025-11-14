<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Channel Sync Toolkit</h1>
      <p class="subtitle">轻松通过频道同步二维码扫描数据</p>
      <nav class="nav-links">
        <RouterLink to="/scanner">扫描者</RouterLink>
        <RouterLink to="/receiver">接收者</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <footer class="app-footer">
      <p>频道将在 TTL 到期后自动失效，请及时同步新数据。</p>
    </footer>
  </div>
</template>

<script setup></script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 2rem 1.5rem 1rem;
  text-align: center;
  background: linear-gradient(135deg, #1d3557, #457b9d);
  color: #f1faee;
  box-shadow: 0 8px 24px rgba(17, 34, 64, 0.25);
  position: sticky;
  top: 0;
  z-index: 10;
}

.subtitle {
  margin-top: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.95rem;
  opacity: 0.85;
}

.nav-links {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.nav-links a {
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: rgba(241, 250, 238, 0.15);
  color: inherit;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s ease, transform 0.2s ease;
}

.nav-links a.router-link-active {
  background: #f1faee;
  color: #1d3557;
  transform: translateY(-1px);
}

.nav-links a:hover {
  background: rgba(241, 250, 238, 0.3);
  transform: translateY(-1px);
}

.app-main {
  flex: 1;
  padding: 2rem 1.5rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: linear-gradient(180deg, #f8fafc 0%, #edf2f7 100%);
}

.app-footer {
  text-align: center;
  padding: 1rem;
  font-size: 0.85rem;
  color: #475569;
}
</style>
