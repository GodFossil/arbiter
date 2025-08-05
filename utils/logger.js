import chalk from 'chalk';
export default {
 info : (...m) => console.log(chalk.blue('[INFO]'), ...m),
 debug: (...m) => console.log(chalk.gray('[DEBUG]'), ...m),
 warn : (...m) => console.warn(chalk.yellow('[WARN]'), ...m),
 error: (...m) => console.error(chalk.red('[ERR]'), ...m)
};