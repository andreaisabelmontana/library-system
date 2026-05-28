/* catalog.js — seed data: 32 classic books across genres + 3 demo users. */
'use strict';
window.LibCatalog = (() => {

const AUTHORS = [
  { id: 'au-001', name: 'Gabriel García Márquez', nationality: 'Colombian' },
  { id: 'au-002', name: 'Jorge Luis Borges',      nationality: 'Argentine' },
  { id: 'au-003', name: 'Isabel Allende',         nationality: 'Chilean' },
  { id: 'au-004', name: 'Julio Cortázar',         nationality: 'Argentine' },
  { id: 'au-005', name: 'Mario Vargas Llosa',     nationality: 'Peruvian' },
  { id: 'au-006', name: 'Pablo Neruda',           nationality: 'Chilean' },
  { id: 'au-007', name: 'Jane Austen',            nationality: 'British' },
  { id: 'au-008', name: 'Charlotte Brontë',       nationality: 'British' },
  { id: 'au-009', name: 'Virginia Woolf',         nationality: 'British' },
  { id: 'au-010', name: 'George Orwell',          nationality: 'British' },
  { id: 'au-011', name: 'J.R.R. Tolkien',         nationality: 'British' },
  { id: 'au-012', name: 'Agatha Christie',        nationality: 'British' },
  { id: 'au-013', name: 'Fyodor Dostoevsky',      nationality: 'Russian' },
  { id: 'au-014', name: 'Leo Tolstoy',            nationality: 'Russian' },
  { id: 'au-015', name: 'Franz Kafka',            nationality: 'Czech' },
  { id: 'au-016', name: 'Albert Camus',           nationality: 'French' },
  { id: 'au-017', name: 'Marcel Proust',          nationality: 'French' },
  { id: 'au-018', name: 'Italo Calvino',          nationality: 'Italian' },
  { id: 'au-019', name: 'Umberto Eco',            nationality: 'Italian' },
  { id: 'au-020', name: 'Haruki Murakami',        nationality: 'Japanese' },
  { id: 'au-021', name: 'Yasunari Kawabata',      nationality: 'Japanese' },
  { id: 'au-022', name: 'Chinua Achebe',          nationality: 'Nigerian' },
  { id: 'au-023', name: 'Toni Morrison',          nationality: 'American' },
  { id: 'au-024', name: 'F. Scott Fitzgerald',    nationality: 'American' },
  { id: 'au-025', name: 'Ursula K. Le Guin',      nationality: 'American' },
];

const BOOKS = [
  { isbn: '9780307474728', title: 'One Hundred Years of Solitude', year: 1967, authorIds: ['au-001'], genre: 'Magical realism', totalCopies: 3 },
  { isbn: '9780525564096', title: 'Love in the Time of Cholera',   year: 1985, authorIds: ['au-001'], genre: 'Romance',         totalCopies: 2 },
  { isbn: '9780802130303', title: 'Ficciones',                     year: 1944, authorIds: ['au-002'], genre: 'Short stories',   totalCopies: 2 },
  { isbn: '9780525433507', title: 'The Aleph and Other Stories',   year: 1949, authorIds: ['au-002'], genre: 'Short stories',   totalCopies: 1 },
  { isbn: '9781501117008', title: 'The House of the Spirits',      year: 1982, authorIds: ['au-003'], genre: 'Magical realism', totalCopies: 2 },
  { isbn: '9780394752846', title: 'Hopscotch',                     year: 1963, authorIds: ['au-004'], genre: 'Experimental',    totalCopies: 1 },
  { isbn: '9780374256371', title: 'The Time of the Hero',          year: 1963, authorIds: ['au-005'], genre: 'Literary',        totalCopies: 1 },
  { isbn: '9780374531133', title: 'Twenty Love Poems',             year: 1924, authorIds: ['au-006'], genre: 'Poetry',          totalCopies: 3 },
  { isbn: '9780141439518', title: 'Pride and Prejudice',           year: 1813, authorIds: ['au-007'], genre: 'Classic',         totalCopies: 4 },
  { isbn: '9780141439587', title: 'Sense and Sensibility',         year: 1811, authorIds: ['au-007'], genre: 'Classic',         totalCopies: 2 },
  { isbn: '9780141441146', title: 'Jane Eyre',                     year: 1847, authorIds: ['au-008'], genre: 'Classic',         totalCopies: 2 },
  { isbn: '9780156628709', title: 'Mrs Dalloway',                  year: 1925, authorIds: ['au-009'], genre: 'Modernist',       totalCopies: 1 },
  { isbn: '9780156907392', title: 'To the Lighthouse',             year: 1927, authorIds: ['au-009'], genre: 'Modernist',       totalCopies: 2 },
  { isbn: '9780451524935', title: '1984',                          year: 1949, authorIds: ['au-010'], genre: 'Dystopia',        totalCopies: 4 },
  { isbn: '9780451526342', title: 'Animal Farm',                   year: 1945, authorIds: ['au-010'], genre: 'Dystopia',        totalCopies: 3 },
  { isbn: '9780547928210', title: 'The Hobbit',                    year: 1937, authorIds: ['au-011'], genre: 'Fantasy',         totalCopies: 5 },
  { isbn: '9780544003415', title: 'The Lord of the Rings',         year: 1954, authorIds: ['au-011'], genre: 'Fantasy',         totalCopies: 3 },
  { isbn: '9780062073488', title: 'Murder on the Orient Express',  year: 1934, authorIds: ['au-012'], genre: 'Mystery',         totalCopies: 2 },
  { isbn: '9780062073563', title: 'And Then There Were None',      year: 1939, authorIds: ['au-012'], genre: 'Mystery',         totalCopies: 3 },
  { isbn: '9780486415871', title: 'Crime and Punishment',          year: 1866, authorIds: ['au-013'], genre: 'Classic',         totalCopies: 2 },
  { isbn: '9780374528379', title: 'The Brothers Karamazov',        year: 1880, authorIds: ['au-013'], genre: 'Classic',         totalCopies: 1 },
  { isbn: '9780140447934', title: 'War and Peace',                 year: 1869, authorIds: ['au-014'], genre: 'Classic',         totalCopies: 1 },
  { isbn: '9780140449174', title: 'Anna Karenina',                 year: 1877, authorIds: ['au-014'], genre: 'Classic',         totalCopies: 2 },
  { isbn: '9780805210408', title: 'The Metamorphosis',             year: 1915, authorIds: ['au-015'], genre: 'Modernist',       totalCopies: 3 },
  { isbn: '9780805211061', title: 'The Trial',                     year: 1925, authorIds: ['au-015'], genre: 'Modernist',       totalCopies: 2 },
  { isbn: '9780679720201', title: 'The Stranger',                  year: 1942, authorIds: ['au-016'], genre: 'Philosophy',      totalCopies: 2 },
  { isbn: '9780679733737', title: 'The Plague',                    year: 1947, authorIds: ['au-016'], genre: 'Philosophy',      totalCopies: 2 },
  { isbn: '9780156453806', title: 'If on a Winter\'s Night a Traveler', year: 1979, authorIds: ['au-018'], genre: 'Experimental', totalCopies: 1 },
  { isbn: '9780156001311', title: 'Invisible Cities',              year: 1972, authorIds: ['au-018'], genre: 'Experimental',    totalCopies: 2 },
  { isbn: '9780156001311', title: 'The Name of the Rose',          year: 1980, authorIds: ['au-019'], genre: 'Mystery',         totalCopies: 1 },
  { isbn: '9780375704024', title: 'Kafka on the Shore',            year: 2002, authorIds: ['au-020'], genre: 'Magical realism', totalCopies: 3 },
  { isbn: '9780099448822', title: 'Norwegian Wood',                year: 1987, authorIds: ['au-020'], genre: 'Literary',        totalCopies: 2 },
  { isbn: '9780679722717', title: 'Snow Country',                  year: 1947, authorIds: ['au-021'], genre: 'Literary',        totalCopies: 1 },
  { isbn: '9780385474542', title: 'Things Fall Apart',             year: 1958, authorIds: ['au-022'], genre: 'Literary',        totalCopies: 3 },
  { isbn: '9781400033416', title: 'Beloved',                       year: 1987, authorIds: ['au-023'], genre: 'Literary',        totalCopies: 2 },
  { isbn: '9780743273565', title: 'The Great Gatsby',              year: 1925, authorIds: ['au-024'], genre: 'Classic',         totalCopies: 4 },
  { isbn: '9780441478125', title: 'The Left Hand of Darkness',     year: 1969, authorIds: ['au-025'], genre: 'Sci-fi',          totalCopies: 2 },
  { isbn: '9780441569595', title: 'A Wizard of Earthsea',          year: 1968, authorIds: ['au-025'], genre: 'Fantasy',         totalCopies: 2 },
];

// fix isbn duplicate
BOOKS.find(b => b.title === 'The Name of the Rose').isbn = '9780156001312';

const USERS = [
  { role: 'ADMIN',     username: 'admin',     password: 'admin123', fullName: 'Mara Reyes',  email: 'admin@library.example' },
  { role: 'LIBRARIAN', username: 'librarian', password: 'lib123',   fullName: 'Daniel Park', email: 'librarian@library.example' },
  { role: 'MEMBER',    username: 'member',    password: 'mem123',   fullName: 'Sofia Vega',  email: 'member@library.example' },
  { role: 'MEMBER',    username: 'andrea',    password: 'andrea123',fullName: 'Andrea Montana', email: 'andrea@library.example' },
];

return { AUTHORS, BOOKS, USERS };
})();
