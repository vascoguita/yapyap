import fc from 'fast-check';

// Mutation runs only need to know that a property fails. Shrinking the
// counterexample takes long enough that killed mutants would time out instead.
fc.configureGlobal({ endOnFailure: true });
