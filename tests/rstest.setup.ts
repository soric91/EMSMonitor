import { afterEach, expect } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(jestDomMatchers);

// El auto-cleanup de testing-library se engancha a un `afterEach` global que
// solo se registra con algunos runners. Sin esto, cada render se acumula en el
// mismo document y las consultas por testid encuentran los de los tests
// anteriores — que falla de una forma que parece un bug del componente.
afterEach(cleanup);
