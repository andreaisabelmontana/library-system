/* exceptions.js — checked-exception hierarchy, mirroring the Java syllabus.
 * LibraryException
 * ├── AuthenticationException
 * ├── AuthorizationException
 * ├── ValidationException
 * ├── NotFoundException
 * ├── DuplicateException
 * ├── BookNotAvailableException
 * ├── LoanRuleException
 * └── CsvFormatException
 * ------------------------------------------------------------------------- */
'use strict';

class LibraryException extends Error {
  constructor(message, cause) { super(message); this.name = 'LibraryException'; if (cause) this.cause = cause; }
  toString() { return `${this.name}: ${this.message}`; }
}
class AuthenticationException extends LibraryException { constructor(m = 'Invalid credentials') { super(m); this.name = 'AuthenticationException'; } }
class AuthorizationException extends LibraryException { constructor(m = 'Not authorised') { super(m); this.name = 'AuthorizationException'; } }
class ValidationException extends LibraryException { constructor(m, field) { super(m); this.name = 'ValidationException'; this.field = field || null; } }
class NotFoundException extends LibraryException { constructor(entity, id) { super(`${entity} ${id} not found`); this.name = 'NotFoundException'; this.entity = entity; this.id = id; } }
class DuplicateException extends LibraryException { constructor(entity, key) { super(`${entity} "${key}" already exists`); this.name = 'DuplicateException'; this.entity = entity; this.key = key; } }
class BookNotAvailableException extends LibraryException { constructor(title) { super(`"${title}" has no available copies`); this.name = 'BookNotAvailableException'; } }
class LoanRuleException extends LibraryException { constructor(m) { super(m); this.name = 'LoanRuleException'; } }
class CsvFormatException extends LibraryException { constructor(m, line) { super(`CSV line ${line || '?'}: ${m}`); this.name = 'CsvFormatException'; this.lineNumber = line || null; } }

window.LibEx = {
  LibraryException, AuthenticationException, AuthorizationException, ValidationException,
  NotFoundException, DuplicateException, BookNotAvailableException, LoanRuleException, CsvFormatException,
};
