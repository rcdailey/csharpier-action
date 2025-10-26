namespace  ExampleApp.Services
{
    public class UserService
    {
        private readonly IDatabase database;
        private readonly ILogger logger;

        public UserService(IDatabase database, ILogger logger)
        {
            this.database = database;
            this.logger = logger;
        }

        public async Task<User> GetUserAsync(int userId){logger.LogInformation("Fetching user {UserId}", userId);return await database.GetUserAsync(userId);}

        public async Task<bool> CreateUserAsync(User user)
        {
            if (user == null)
            {
                throw new ArgumentNullException(nameof(user));
            }

            logger.LogInformation("Creating user {Username}", user.Username);
            return await database.InsertUserAsync(user);
        }

        public async Task<bool> UpdateUserAsync(User user)
        {
            if(user==null)
            {
                throw new ArgumentNullException(nameof(user));
            }

            logger.LogInformation("Updating user {UserId}", user.Id);
            return await database.UpdateUserAsync(user);
        }

        public async Task<bool> DeleteUserAsync(int userId)
        {
            logger.LogInformation("Deleting user {UserId}", userId);
            return await database.DeleteUserAsync(userId);
        }

        public async Task<List<User>> SearchUsersAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return new List<User>();
            }

            logger.LogInformation("Searching users with query: {Query}", query);
            return await database.SearchUsersAsync(query);
        }
    }
}
