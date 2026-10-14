export default function LikedScreen({ liked, disliked, onOpen, onUnlike, onRestore, onBack }) {
  return (
    <section>
      <button type="button" onClick={onBack}>Back to ingredients</button>
      <h1>Liked recipes</h1>
      {liked.length === 0 && <p>No liked recipes yet.</p>}
      <ul>
        {liked.map((r) => (
          <li key={r.id}>
            <span>{r.title}</span>
            <button type="button" aria-label={`Open ${r.title}`} onClick={() => onOpen(r)}>Open</button>
            <button type="button" aria-label={`Remove ${r.title}`} onClick={() => onUnlike(r.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <h2>Not liked</h2>
      {disliked.length === 0 && <p>Nothing here.</p>}
      <ul>
        {disliked.map((r) => (
          <li key={r.id}>
            <span>{r.title}</span>
            <button type="button" aria-label={`Restore ${r.title}`} onClick={() => onRestore(r.id)}>Restore</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
