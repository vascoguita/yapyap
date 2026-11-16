import type { JSX } from 'preact';

/** The first letter of the name, which the avatar shows like a contact's initial. */
function initial(name: string): string {
  // Names are never blank (the Accounts window trims and checks them).
  return Array.from(name.trim()).slice(0, 1).join('').toUpperCase();
}

/**
 * An account's avatar: its WhatsApp photo once YapYap has it (#87), else its
 * initial, ringed in the account's color either way, so the color the user
 * picked tells accounts apart even when their photos look alike.
 */
export function Avatar(props: {
  readonly name: string;
  readonly color: string;
  readonly photo: string | undefined;
}): JSX.Element {
  return (
    <span class={`avatar swatch-${props.color}`} aria-hidden="true">
      {props.photo === undefined ? (
        initial(props.name)
      ) : (
        <img class="photo" src={props.photo} alt="" />
      )}
    </span>
  );
}
