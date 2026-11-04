// One place for the bcrypt work factor, so a hash made anywhere in the app costs the same to verify.
export const BCRYPT_COST = 12;

// A real bcrypt hash at BCRYPT_COST of a throwaway string. authorize() compares the typed password against this when
// the email doesn't exist, so an unknown account takes as long as a real one and response time can't be used to find
// out which emails are registered. It MUST use the same cost as real users' hashes — the previous dummy was cost 10
// (about 4x cheaper than the cost-12 hashes), which made unknown emails measurably faster.
export const DUMMY_PASSWORD_HASH = "$2b$12$S7VTR6qc5glux96dsYrjvONyYYa4m8/9A1Fy/UEx/.wy8ZV5Bqt36";
