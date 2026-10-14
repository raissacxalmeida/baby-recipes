export default function TooYoungScreen({ onChangeBirthday }) {
  return (
    <section>
      <h1>Not yet</h1>
      <p>Solid foods usually start around 6 months, so no recipes are suggested for now.</p>
      <button type="button" onClick={onChangeBirthday}>Change birthday</button>
    </section>
  );
}
