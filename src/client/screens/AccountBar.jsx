export default function AccountBar({ user, onLogout, onDelete, onAdmin }) {
  return (
    <header className="account-bar">
      <span>{user.email}</span>
      {user.isAdmin && <button type="button" onClick={onAdmin}>Admin</button>}
      <button type="button" onClick={onLogout}>Log out</button>
      {!user.isAdmin && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete the account ${user.email} and all its saved data? This cannot be undone.`)) onDelete();
          }}
        >
          Delete my account
        </button>
      )}
    </header>
  );
}
