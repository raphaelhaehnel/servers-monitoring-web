const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-left">
        <span className="footer-copy">
          © {YEAR} <span className="footer-name">Raphael Haehnel</span>
        </span>
      </div>

      <div className="footer-right">
        <div className="footer-ai-dot" />
        <span className="footer-ai-label">Powered by</span>
        <span className="footer-ai-model">Claude Sonnet 4.6</span>
      </div>
    </footer>
  )
}
