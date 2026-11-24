import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import {
  descriptionOn,
  SETTING_FIELDS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';
import { Icon } from '../shared/icons.tsx';

const text = en.settings;

export type Change = (id: string, value: SettingValue) => void;

interface FieldProps {
  readonly field: SettingField;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
  /** Opens the system's folder dialog for a folder field. */
  readonly onChooseFolder?: (id: string) => void;
  /** Shown faded, because another setting makes it matter less for now. */
  readonly dimmed?: boolean;
}

type Options = NonNullable<SettingField['options']>;

/** The ids that describe a field's control: its restart tag, if any, then its description. */
const describedBy = (field: SettingField): string =>
  field.restart ? `${field.id}-tag ${field.id}-hint` : `${field.id}-hint`;

/** The field's description, then why its last change did not take effect. */
function Hint({ field, snapshot }: Pick<FieldProps, 'field' | 'snapshot'>): JSX.Element {
  return (
    <p id={`${field.id}-hint`} class="hint">
      {descriptionOn(field, snapshot.platform)}
      <span class="problem" aria-live="polite">
        {snapshot.problems[field.id]}
      </span>
    </p>
  );
}

/** A setting that only takes effect at the next launch says so beside its name. */
function RestartTag({ field }: { readonly field: SettingField }): JSX.Element | null {
  return field.restart ? (
    <span id={`${field.id}-tag`} class="pill">
      <Icon name="restart" />
      {text.restartTag}
    </span>
  ) : null;
}

/**
 * A setting as one row: its name and description on the left, its control
 * on the right. A label that names a control (`labelFor`) makes the whole
 * row a target for it.
 */
function Row(
  props: Pick<FieldProps, 'field' | 'snapshot' | 'dimmed'> & {
    readonly labelFor?: string;
    readonly children: ComponentChildren;
  },
): JSX.Element {
  const { field, labelFor } = props;
  const name =
    labelFor === undefined ? (
      <span id={`${field.id}-label`} class="row-label">
        {field.label}
      </span>
    ) : (
      <label id={`${field.id}-label`} class="row-label" for={labelFor}>
        {field.label}
      </label>
    );
  return (
    <div class={props.dimmed === true ? 'row dimmed' : 'row'}>
      <div class="row-text">
        <div class="row-title">
          {name}
          <RestartTag field={field} />
        </div>
        <Hint field={field} snapshot={props.snapshot} />
      </div>
      <div class="row-control">{props.children}</div>
    </div>
  );
}

/** A few short options side by side, as radio buttons that look like one control. */
function Segmented(props: FieldProps & { readonly options: Options }): JSX.Element {
  const { field, snapshot, onChange, options } = props;
  return (
    <Row field={field} snapshot={snapshot}>
      <div
        role="radiogroup"
        class="segmented"
        aria-labelledby={`${field.id}-label`}
        aria-describedby={describedBy(field)}
      >
        {options.map(({ value, label }) => (
          <label key={String(value)}>
            <input
              type="radio"
              name={field.id}
              value={value}
              checked={snapshot.values[field.id] === value}
              onChange={() => {
                onChange(field.id, value);
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </Row>
  );
}

/** The options, plus the stored value when the list lacks it, so the list never shows another. */
function optionsWith(field: SettingField, options: Options, current: SettingValue | undefined) {
  if (current === undefined || field.unlisted === undefined) {
    return options;
  }
  const listed = options.some(({ value }) => value === current);
  return listed
    ? options
    : [...options, { value: String(current), label: field.unlisted(current) }];
}

/** Many or long options, as a list to pick from. */
function Select(props: FieldProps & { readonly options: Options }): JSX.Element {
  const { field, snapshot, onChange } = props;
  const current = snapshot.values[field.id];
  const options = optionsWith(field, props.options, current);
  return (
    <Row field={field} snapshot={snapshot} labelFor={field.id}>
      <select
        id={field.id}
        value={String(current)}
        aria-describedby={describedBy(field)}
        onChange={(event) => {
          const picked = props.options.find(
            ({ value }) => String(value) === event.currentTarget.value,
          );
          if (picked !== undefined) {
            onChange(field.id, picked.value);
          }
        }}
      >
        {options.map(({ value, label }) => (
          <option key={String(value)} value={String(value)}>
            {label}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** A line of text that saves on Enter or when focus leaves it. */
function TextInput(props: {
  readonly field: SettingField;
  readonly value: string;
  readonly placeholder: string;
  readonly onEdit: () => void;
  readonly onSave: (value: string) => void;
}): JSX.Element {
  const { field, onSave } = props;
  return (
    <input
      id={field.id}
      type="text"
      spellcheck={false}
      placeholder={props.placeholder}
      defaultValue={props.value}
      aria-describedby={`${field.id}-hint`}
      onInput={props.onEdit}
      onBlur={(event) => {
        onSave(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSave(event.currentTarget.value);
        }
      }}
    />
  );
}

/**
 * A line of text, saved on Enter or when focus leaves, so a half-typed
 * address is never checked; YapYap refuses one that does not fit, and says
 * why under it.
 */
function TextField(props: FieldProps & { readonly placeholder: string }) {
  const { field, snapshot, onChange } = props;
  const [saved, setSaved] = useState(false);
  const save = (value: string): void => {
    if (value.trim() !== snapshot.values[field.id]) {
      onChange(field.id, value.trim());
      setSaved(true);
    }
  };
  const confirmed = saved && snapshot.problems[field.id] === undefined;
  return (
    <div class="row stacked">
      <label class="row-label" for={field.id}>
        {field.label}
      </label>
      <div class="line">
        <TextInput
          field={field}
          value={String(snapshot.values[field.id] ?? '')}
          placeholder={props.placeholder}
          onEdit={() => {
            setSaved(false);
          }}
          onSave={save}
        />
        <span aria-live="polite">
          {confirmed ? <Pill tone="success" label={text.saved} /> : null}
        </span>
      </div>
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

/** How long a folder may be before its middle gives way to an ellipsis. */
const FOLDER_CHARACTERS = 32;

/** Keeps a long path's start and its last folders, which tell paths apart. */
function shortPath(path: string): string {
  if (path.length <= FOLDER_CHARACTERS) {
    return path;
  }
  const half = Math.floor((FOLDER_CHARACTERS - 1) / 2);
  return `${path.slice(0, half)}…${path.slice(path.length - half)}`;
}

/** A folder chosen in the system's dialog; the page never types a path itself. */
function FolderField(props: FieldProps & { readonly words: NonNullable<SettingField['folder']> }) {
  const { field, snapshot, onChange, onChooseFolder, words } = props;
  const folder = String(snapshot.values[field.id] ?? '');
  const shown = folder === '' ? words.defaultName : folder;
  return (
    <Row field={field} snapshot={snapshot} dimmed={props.dimmed === true}>
      <span class={folder === '' ? 'path' : 'path chosen'} title={shown}>
        {shortPath(shown)}
      </span>
      {/* Named with the field too, so each folder's button is told apart. */}
      <button
        type="button"
        id={`${field.id}-choose`}
        aria-labelledby={`${field.id}-choose ${field.id}-label`}
        onClick={() => {
          onChooseFolder?.(field.id);
        }}
      >
        {text.chooseFolder}
      </button>
      {folder === '' ? null : (
        <button
          type="button"
          onClick={() => {
            onChange(field.id, '');
          }}
        >
          {words.useDefault}
        </button>
      )}
    </Row>
  );
}

type Steps = NonNullable<SettingField['stepper']>['steps'];

/** A − or + button: to the next step that way, or disabled at the end. */
function StepButton(props: {
  readonly field: SettingField;
  readonly to: number | undefined;
  readonly label: string;
  readonly icon: 'minus' | 'plus';
  readonly onChange: Change;
}): JSX.Element {
  const { field, to, onChange } = props;
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={to === undefined}
      onClick={
        to === undefined
          ? undefined
          : () => {
              onChange(field.id, to);
            }
      }
    >
      <Icon name={props.icon} />
    </button>
  );
}

/**
 * A whole number with − and + buttons beside it (#766). A stored value
 * between two steps goes to the nearer one each way.
 */
function Stepper(props: FieldProps & { readonly steps: Steps }): JSX.Element {
  const { field, snapshot, onChange, steps } = props;
  const value = Number(snapshot.values[field.id]);
  return (
    <fieldset
      class="stepper"
      aria-labelledby={`${field.id}-label`}
      aria-describedby={`${field.id}-hint`}
    >
      <StepButton
        field={field}
        to={steps.findLast((step) => step < value)}
        label={text.fewer}
        icon="minus"
        onChange={onChange}
      />
      <output aria-live="polite">{value}</output>
      <StepButton
        field={field}
        to={steps.find((step) => step > value)}
        label={text.more}
        icon="plus"
        onChange={onChange}
      />
    </fieldset>
  );
}

/**
 * A number in a line of its own under the setting before it, which it
 * belongs to, worded around it: "From − 10 + unread messages".
 */
function NestedStepper(
  props: FieldProps & {
    readonly steps: Steps;
    readonly words: { readonly before: string; readonly after: string };
  },
): JSX.Element {
  const { field, words } = props;
  return (
    <div class={props.dimmed === true ? 'row nested dimmed' : 'row nested'}>
      <span id={`${field.id}-label`} class="visually-hidden">
        {field.label}
      </span>
      <span id={`${field.id}-hint`} class="visually-hidden">
        {field.description}
      </span>
      <span aria-hidden="true">{words.before}</span>
      <Stepper {...props} />
      <span aria-hidden="true">{words.after}</span>
    </div>
  );
}

/** A whole number: in a row of its own, or under the setting it belongs to. */
function NumberField(
  props: FieldProps & { readonly stepper: NonNullable<SettingField['stepper']> },
): JSX.Element {
  const { field, snapshot, stepper } = props;
  const { steps, words } = stepper;
  return words === undefined ? (
    <Row field={field} snapshot={snapshot} dimmed={props.dimmed === true}>
      <Stepper {...props} steps={steps} />
    </Row>
  ) : (
    <NestedStepper {...props} steps={steps} words={words} />
  );
}

/** An on/off setting, as a switch: it applies as soon as it flips. */
function Switch(props: FieldProps): JSX.Element {
  const { field, snapshot, onChange } = props;
  return (
    <Row field={field} snapshot={snapshot} labelFor={field.id} dimmed={props.dimmed === true}>
      <input
        id={field.id}
        type="checkbox"
        role="switch"
        class="switch"
        checked={snapshot.values[field.id] === true}
        aria-describedby={describedBy(field)}
        onChange={(event) => {
          onChange(field.id, event.currentTarget.checked);
        }}
      />
    </Row>
  );
}

export function Field(props: FieldProps): JSX.Element {
  const { field } = props;
  if (field.folder !== undefined) {
    return <FolderField {...props} words={field.folder} />;
  }
  if (field.options !== undefined) {
    return field.segmented === true ? (
      <Segmented {...props} options={field.options} />
    ) : (
      <Select {...props} options={field.options} />
    );
  }
  if (field.stepper !== undefined) {
    return <NumberField {...props} stepper={field.stepper} />;
  }
  if (field.text !== undefined) {
    return <TextField {...props} placeholder={field.text.placeholder} />;
  }
  return <Switch {...props} />;
}

/** The listed fields with `id`, which every platform has; those in `dimmed` shown faded. */
export function fieldsOf(
  ids: readonly string[],
  snapshot: SettingsSnapshot,
  onChange: Change,
  dimmed: readonly string[] = [],
): JSX.Element[] {
  return SETTING_FIELDS.filter((field) => ids.includes(field.id)).map((field) => (
    <Field
      key={field.id}
      field={field}
      snapshot={snapshot}
      onChange={onChange}
      dimmed={dimmed.includes(field.id)}
    />
  ));
}

export type Tone = 'success' | 'warning' | 'neutral' | 'accent';

const TONE_ICONS = {
  success: 'check',
  warning: 'alert',
  neutral: 'circle',
  accent: 'downloads',
} as const;

/** A short status, with an icon so it never rests on color alone. */
export function Pill(props: { readonly tone: Tone; readonly label: string }): JSX.Element {
  return (
    <span class={`pill ${props.tone}`}>
      <Icon name={TONE_ICONS[props.tone]} />
      {props.label}
    </span>
  );
}

/** Rows that belong together, in one card under a short title. */
export function Group(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <fieldset class="group-section" aria-labelledby={`${props.id}-group`}>
      <h2 id={`${props.id}-group`} class="group-title">
        {props.title}
      </h2>
      <div class="group">{props.children}</div>
    </fieldset>
  );
}
