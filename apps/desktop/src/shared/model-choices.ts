/** A model as the provider lists it. */
export interface ListedModel {
  readonly id: string;
  readonly label: string;
}

/**
 * The models a model picker lists after Auto. Auto already names the model
 * it picks, so that model would show twice; it stays only while it is the
 * saved choice, so a model picked by name never reads as Auto, which may
 * pick another one later.
 */
export function modelsBesideAuto<Model extends ListedModel>(
  models: readonly Model[],
  auto: ListedModel | null,
  picked: string,
): readonly Model[] {
  return models.filter(({ id }) => id !== auto?.id || id === picked);
}
