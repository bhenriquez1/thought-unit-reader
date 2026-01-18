// Jest setup file - mocks for Firebase and other dependencies

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  getDbInstance: jest.fn(() => null),
  auth: null,
  db: null,
}));

// Mock firebase/firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  serverTimestamp: jest.fn(() => new Date().toISOString()),
  onSnapshot: jest.fn(() => jest.fn()),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Clear localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
});
